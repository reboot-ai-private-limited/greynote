import { narrowToTeam } from '@/shared/access/teamScope.js';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { TeamDirectoryPort, TeamDoctorService, TeamFieldActivityPort, TeamMasterPort, TeamRoutesPort } from '../../domain/ports.js';

export interface ServiceTotals {
  count: number;
  totalPaise: number;
  /** Counts by stage: waiting for approval, approved and still to do, done, rejected. */
  waiting: number;
  toDo: number;
  done: number;
  rejected: number;
}

const stageOf = (s: TeamDoctorService): 'waiting' | 'toDo' | 'done' | 'rejected' | 'other' =>
  s.doneAt ? 'done' : s.status === 'REJECTED' ? 'rejected' : s.status === 'APPROVED' || s.status === 'MANAGER_APPROVED' ? 'toDo' : s.status === 'SUBMITTED' ? 'waiting' : 'other';

export const totalsOf = (services: TeamDoctorService[]): ServiceTotals => {
  const t: ServiceTotals = { count: 0, totalPaise: 0, waiting: 0, toDo: 0, done: 0, rejected: 0 };
  for (const s of services) {
    const stage = stageOf(s);
    if (stage === 'other') continue;
    t.count += 1;
    if (stage !== 'rejected') t.totalPaise += s.amountPaise;
    t[stage] += 1;
  }
  return t;
};

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export interface TeamDoctorRow {
  id: string;
  name: string;
  specialty: string;
  clinicName: string | null;
  routeName: string | null;
  visitFrequency: number | null;
  /** The MR who holds him (on a manager's page this is how you tell their team apart). */
  heldBy: { id: string; name: string };
  /** Calls logged in the month, and the most recent call in the last ~2 months (`null` if none). */
  visitsThisMonth: number;
  lastVisit: string | null;
  services: ServiceTotals;
}

/** A person's doctors with how they are visited and what services were asked for them. Downline only (403 otherwise). */
export class TeamMemberDoctorsUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly master: Pick<TeamMasterPort, 'listAssignedDoctors'>,
    private readonly fieldActivity: Pick<TeamFieldActivityPort, 'getActivityRange' | 'listServicesForDoctors'>,
    private readonly routes: TeamRoutesPort,
  ) {}

  /** The person's doctors and, for a manager, those held by everyone below them (`heldBy` says whose). */
  async execute(managerId: string, userId: string, month: string): Promise<{ month: string; items: TeamDoctorRow[] }> {
    narrowToTeam((await this.directory.getDownline(managerId)).map((m) => m.id), userId);
    const range = monthRange(month);
    const below = await this.directory.getDownline(userId);
    const people = [{ id: userId, name: '' }, ...below.map((m) => ({ id: m.id, name: m.name }))];
    const names = new Map((await this.directory.namePeople(people.map((p) => p.id))).map((p) => [p.id, p.name]));
    const held = (await Promise.all(people.map(async (p) => (await this.master.listAssignedDoctors(p.id)).filter((d) => d.status === 'active').map((d) => ({ d, by: p.id }))))).flat();
    const [activityByPerson, services] = await Promise.all([
      Promise.all(people.map(async (p) => [p.id, await this.fieldActivity.getActivityRange(p.id, { from: addDays(range.from, -62), to: range.to })] as const)),
      this.fieldActivity.listServicesForDoctors(held.map((h) => h.d.id)),
    ]);
    const visits = new Map<string, { month: number; last: string | null }>();
    for (const [, activity] of activityByPerson) {
      for (const day of activity) {
        for (const c of day.doctorCalls) {
          const v = visits.get(c.doctorId) ?? { month: 0, last: null };
          if (day.date >= range.from && day.date <= range.to) v.month += 1;
          if (!v.last || day.date > v.last) v.last = day.date;
          visits.set(c.doctorId, v);
        }
      }
    }
    const byDoctor = new Map<string, TeamDoctorService[]>();
    for (const s of services) byDoctor.set(s.doctorId, [...(byDoctor.get(s.doctorId) ?? []), s]);
    const routeNames = new Map<string, string | null>();
    for (const id of new Set(held.map((h) => h.d.routeId))) routeNames.set(id, (await this.routes.getRoute(id))?.name ?? null);
    const items = held
      .map(({ d, by }): TeamDoctorRow => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        clinicName: d.clinicName,
        routeName: routeNames.get(d.routeId) ?? null,
        visitFrequency: d.visitFrequency,
        heldBy: { id: by, name: names.get(by) ?? '' },
        visitsThisMonth: visits.get(d.id)?.month ?? 0,
        lastVisit: visits.get(d.id)?.last ?? null,
        services: totalsOf(byDoctor.get(d.id) ?? []),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { month, items };
  }
}

/** One doctor in full for a manager (or the MR above): who holds him, how he is visited, every service asked for him. 404 unless the holder is in the downline. */
export class TeamDoctorUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly master: Pick<TeamMasterPort, 'getDoctor' | 'getAssignedUserId'>,
    private readonly fieldActivity: Pick<TeamFieldActivityPort, 'getActivityRange' | 'listServicesForDoctors'>,
    private readonly routes: TeamRoutesPort,
  ) {}

  async execute(managerId: string, doctorId: string, month: string) {
    const doctor = await this.master.getDoctor(doctorId);
    const holder = doctor ? await this.master.getAssignedUserId(doctorId) : null;
    const downline = await this.directory.getDownline(managerId);
    const person = downline.find((m) => m.id === holder);
    if (!doctor || !holder || !person) throw AppError.notFound('No such doctor.');
    const range = monthRange(month);
    const [activity, services] = await Promise.all([
      this.fieldActivity.getActivityRange(holder, { from: addDays(range.from, -62), to: range.to }),
      this.fieldActivity.listServicesForDoctors([doctorId]),
    ]);
    const calls = activity
      .flatMap((a) => a.doctorCalls.filter((c) => c.doctorId === doctorId).map((c) => ({ date: a.date, at: c.recordedAt.toISOString(), remarks: c.remarks, geofence: c.geofence })))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty, clinicName: doctor.clinicName, phone: doctor.phone, address: doctor.address, visitFrequency: doctor.visitFrequency, routeName: (await this.routes.getRoute(doctor.routeId))?.name ?? null },
      heldBy: { id: person.id, name: person.name, employeeCode: person.employeeCode },
      month,
      visitsThisMonth: calls.filter((c) => c.date >= range.from && c.date <= range.to).length,
      calls: calls.slice(0, 30),
      services: { totals: totalsOf(services), items: services.map((s) => ({ id: s.id, serviceType: s.serviceType, amountPaise: s.amountPaise, remarks: s.remarks, status: s.status, doneAt: s.doneAt ? s.doneAt.toISOString() : null, askedBy: s.userName ?? '', createdAt: s.createdAt.toISOString() })) },
    };
  }
}
