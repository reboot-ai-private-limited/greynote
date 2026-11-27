import type { CallCoverageDto, CallPerformanceReportDto, CallPerformanceRowDto, MissedDoctorDto } from '@greynote/contracts';
import { isFieldDay, type WorkingType } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { CallFiguresPort, DayTypesPort, DesignationLevelsPort, FieldRosterPort, HeldDoctorsPort, PlaceNamesPort } from '../domain/ports.js';

type Employee = Awaited<ReturnType<FieldRosterPort['listFieldEmployees']>>[number];
type HeldDoctor = Awaited<ReturnType<HeldDoctorsPort['listAssignedDoctors']>>[number];

const MR_LEVEL = 1;
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));
const avg = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 10) / 10);

/** Months from `from` to `to` inclusive (`YYYY-MM`). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Coverage of a doctor list by its holders' calls (`calls`: holder|doctor → count). Required visits are frequency × months. */
export function coverageOf(doctors: Array<{ doctor: Pick<HeldDoctor, 'id' | 'visitFrequency'>; holderId: string }>, calls: Map<string, number>, months: number): CallCoverageDto {
  let met = 0;
  let withFrequency = 0;
  let metFully = 0;
  let required = 0;
  let made = 0;
  for (const { doctor, holderId } of doctors) {
    const n = calls.get(`${holderId}|${doctor.id}`) ?? 0;
    if (n > 0) met += 1;
    if (doctor.visitFrequency != null && doctor.visitFrequency > 0) {
      const owed = doctor.visitFrequency * months;
      withFrequency += 1;
      required += owed;
      made += Math.min(n, owed);
      if (n >= owed) metFully += 1;
    }
  }
  return {
    doctors: doctors.length,
    met,
    withFrequency,
    metFully,
    required,
    made,
    missed: doctors.length - met,
    coveragePct: pct(met, doctors.length),
    frequencyPct: pct(metFully, withFrequency),
    compliancePct: pct(made, required),
  };
}

const sumCoverage = (list: CallCoverageDto[]): CallCoverageDto => {
  const t = list.reduce(
    (a, c) => ({ doctors: a.doctors + c.doctors, met: a.met + c.met, withFrequency: a.withFrequency + c.withFrequency, metFully: a.metFully + c.metFully, required: a.required + c.required, made: a.made + c.made }),
    { doctors: 0, met: 0, withFrequency: 0, metFully: 0, required: 0, made: 0 },
  );
  return { ...t, missed: t.doctors - t.met, coveragePct: pct(t.met, t.doctors), frequencyPct: pct(t.metFully, t.withFrequency), compliancePct: pct(t.made, t.required) };
};

/**
 * Call average and coverage (decision-log 2026-11-27), per employee over whole months:
 *
 * - **Field days**: counted daily reports (final by the `DCR_APPROVAL_REQUIRED` rule) whose planned day is Field Work or Doctor Campaign; a
 *   report with no plan row counts when it has calls. **Call average** = calls on those days ÷ field days, one decimal.
 * - **Coverage** of the doctors held now (MCL): met at least once, met as often as frequency × months, and visits made of those owed
 *   (capped per doctor). An MR's own list; a manager holds none, so theirs is their team's, each doctor called by its holder.
 *
 * Admin reads everyone (narrowed by zone, HQ or manager); a field employee reads themself and their downline. Totals are over the MRs'
 * own rows, so a manager's team row never counts twice. Reads only.
 */
export class CallPerformanceReport {
  constructor(
    private readonly roster: FieldRosterPort,
    private readonly levels: DesignationLevelsPort,
    private readonly calls: CallFiguresPort,
    private readonly plans: DayTypesPort,
    private readonly doctors: HeldDoctorsPort,
    private readonly places?: PlaceNamesPort,
  ) {}

  async read(input: { actor: { id: string; role: string }; fromMonth: string; toMonth: string; zoneId?: string | undefined; hqId?: string | undefined; managerId?: string | undefined }): Promise<CallPerformanceReportDto> {
    if (input.toMonth < input.fromMonth) throw AppError.badRequest('The last month is before the first.', { field: 'toMonth' });
    const rows = await this.rowsFor(await this.audience(input), input.fromMonth, input.toMonth);
    const own = rows.filter((r) => r.scope === 'OWN');
    const fieldDays = rows.reduce((n, r) => n + r.fieldDays, 0);
    const doctorCalls = rows.reduce((n, r) => n + r.doctorCalls, 0);
    const chemistCalls = rows.reduce((n, r) => n + r.chemistCalls, 0);
    return {
      fromMonth: input.fromMonth,
      toMonth: input.toMonth,
      rows,
      totals: { fieldDays, doctorCalls, chemistCalls, doctorCallAvg: avg(doctorCalls, fieldDays), chemistCallAvg: avg(chemistCalls, fieldDays), coverage: sumCoverage(own.map((r) => r.coverage)) },
    };
  }

  /** One employee's row for whole months, for a report that has already checked who may read it (the Monthly Work sheet). */
  async forEmployee(userId: string, fromMonth: string, toMonth: string): Promise<CallPerformanceRowDto | null> {
    return (await this.rowsFor(await this.roster.listFieldEmployees([userId]), fromMonth, toMonth))[0] ?? null;
  }

  private async rowsFor(employees: Employee[], fromMonth: string, toMonth: string): Promise<CallPerformanceRowDto[]> {
    const range = { from: monthRange(fromMonth).from, to: monthRange(toMonth).to };
    const months = monthsBetween(fromMonth, toMonth);
    const ids = employees.map((e) => e.id);
    const managers = new Set((await this.levels.getDesignationLevels(ids)).filter((l) => l.level > MR_LEVEL).map((l) => l.userId));

    const figures = await this.calls.callFigures(range, ids);
    const perDoctor = new Map(figures.doctorCalls.map((c) => [`${c.userId}|${c.doctorId}`, c.count]));
    const held = new Map<string, HeldDoctor[]>();
    // Everyone in the rows at once when the doctor lists and plan days can be read in a batch (2026-11-27); anyone else one by one.
    if (this.doctors.listAssignedDoctorsForUsers && ids.length > 0) {
      for (const id of ids) held.set(id, []);
      for (const { assignedUserId, ...d } of await this.doctors.listAssignedDoctorsForUsers(ids)) held.get(assignedUserId)?.push(d);
    }
    const heldBy = async (id: string) => {
      if (!held.has(id)) held.set(id, await this.doctors.listAssignedDoctors(id));
      return held.get(id)!;
    };
    const dayTypes = new Map<string, Array<{ date: string; workingType: string }>>();
    if (this.plans.listDailyPlanDaysForUsers && ids.length > 0) for (const u of await this.plans.listDailyPlanDaysForUsers(ids, range.from, range.to)) dayTypes.set(u.userId, u.days);

    const rows: CallPerformanceRowDto[] = [];
    for (const e of employees) {
      const types = new Map((dayTypes.get(e.id) ?? (await this.plans.listDailyPlanDays(e.id, range.from, range.to))).map((d) => [d.date, d.workingType]));
      const days = figures.days.filter((d) => d.userId === e.id && (types.has(d.date) ? isFieldDay(types.get(d.date) as WorkingType) : d.doctorCalls + d.chemistCalls > 0));
      const doctorCalls = days.reduce((n, d) => n + d.doctorCalls, 0);
      const chemistCalls = days.reduce((n, d) => n + d.chemistCalls, 0);
      const isManager = managers.has(e.id);
      const team = isManager ? (await this.roster.getDownline(e.id)).map((d) => d.id) : [e.id];
      const list: Array<{ doctor: HeldDoctor; holderId: string }> = [];
      for (const holder of team) for (const doctor of await heldBy(holder)) list.push({ doctor, holderId: holder });
      // A manager's team: their people's calls on their own doctors, read for the people outside the report's rows too.
      const outside = team.filter((t) => !ids.includes(t));
      const extra = isManager && outside.length > 0 ? new Map((await this.calls.callFigures(range, outside)).doctorCalls.map((c) => [`${c.userId}|${c.doctorId}`, c.count])) : null;
      const callMap = extra ? new Map([...perDoctor, ...extra]) : perDoctor;
      rows.push({
        employee: { id: e.id, name: e.name, employeeCode: e.employeeCode, designation: e.designation },
        isManager,
        fieldDays: days.length,
        doctorCalls,
        chemistCalls,
        doctorCallAvg: avg(doctorCalls, days.length),
        chemistCallAvg: avg(chemistCalls, days.length),
        scope: isManager ? 'TEAM' : 'OWN',
        coverage: coverageOf(list, callMap, months),
      });
    }
    return rows.sort((a, b) => Number(b.isManager) - Number(a.isManager) || a.employee.name.localeCompare(b.employee.name));
  }

  /** The doctors held with no call in the period: an MR's own, a manager's team's (with who holds each). */
  async missed(input: { actor: { id: string; role: string }; userId: string; fromMonth: string; toMonth: string }): Promise<MissedDoctorDto[]> {
    const [employee] = await this.audience({ actor: input.actor, userIds: [input.userId] });
    if (!employee) throw AppError.notFound('No such field employee.');
    const range = { from: monthRange(input.fromMonth).from, to: monthRange(input.toMonth).to };
    const isManager = (await this.levels.getDesignationLevels([employee.id])).some((l) => l.level > MR_LEVEL);
    const team = isManager ? (await this.roster.getDownline(employee.id)).map((d) => d.id) : [employee.id];
    const called = new Set((await this.calls.callFigures(range, team)).doctorCalls.map((c) => `${c.userId}|${c.doctorId}`));
    const names = new Map((await this.roster.listFieldEmployees(team)).map((e) => [e.id, e.name]));
    const out: Array<Omit<MissedDoctorDto, 'placeName'> & { placeId: string | null }> = [];
    for (const holder of team) {
      for (const d of await this.doctors.listAssignedDoctors(holder)) {
        if (called.has(`${holder}|${d.id}`)) continue;
        out.push({ id: d.id, name: d.name, specialty: d.specialty, address: d.address ?? '', placeId: d.placeId ?? null, visitFrequency: d.visitFrequency ?? null, heldBy: { id: holder, name: names.get(holder) ?? '' } });
      }
    }
    const placeIds = [...new Set(out.flatMap((d) => (d.placeId ? [d.placeId] : [])))];
    const placeName = new Map((this.places && placeIds.length > 0 ? await this.places.getPlaces(placeIds) : []).map((p) => [p.id, p.name]));
    return out
      .map(({ placeId, ...d }) => ({ ...d, placeName: placeId ? (placeName.get(placeId) ?? null) : null }))
      .sort((a, b) => (b.visitFrequency ?? 0) - (a.visitFrequency ?? 0) || a.name.localeCompare(b.name));
  }

  /** Who the reader may see: Admin everyone (narrowed by zone, HQ, manager or ids); a field employee themself and their downline. */
  private async audience(input: { actor: { id: string; role: string }; zoneId?: string | undefined; hqId?: string | undefined; managerId?: string | undefined; userIds?: string[] }): Promise<Employee[]> {
    const { actor } = input;
    let ids: string[] | undefined;
    if (actor.role === 'FIELD') ids = [actor.id, ...(await this.roster.getDownline(actor.id)).map((d) => d.id)];
    else if (actor.role !== 'ADMIN') throw AppError.forbidden();
    if (input.managerId) {
      const team = [input.managerId, ...(await this.roster.getDownline(input.managerId)).map((d) => d.id)];
      ids = ids ? ids.filter((id) => team.includes(id)) : team;
    }
    if (input.userIds) {
      if (ids && input.userIds.some((id) => !ids!.includes(id))) throw AppError.forbidden('You can only see yourself and your team.');
      ids = input.userIds;
    }
    const all = await this.roster.listFieldEmployees(ids);
    return all.filter((e) => (!input.zoneId || e.zoneId === input.zoneId) && (!input.hqId || e.hqId === input.hqId));
  }
}
