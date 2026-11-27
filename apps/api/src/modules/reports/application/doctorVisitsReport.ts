import type { DoctorVisitMrDto, DoctorVisitsReportDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { CallFiguresPort, FieldRosterPort, MasterPort, PlannedDoctorsPort } from '../domain/ports.js';

/**
 * Each Doctor's visit frequency against the employee's own calls on counted days of a month (2026-11-27: by that employee only, on daily
 * reports counted by the `DCR_APPROVAL_REQUIRED` rule, as the call average and coverage report): per employee the quota, calls made
 * and calls missed, and per Doctor the same. Only Doctors with a frequency count. Calls above a Doctor's frequency don't
 * offset another Doctor's missed ones (`made` is capped per Doctor). Admin reads any employee; a manager reads themself
 * and their downline; any other employee reads only themself. Reads only.
 */
export class DoctorVisitsReport {
  constructor(
    private readonly roster: FieldRosterPort,
    private readonly master: MasterPort,
    private readonly fieldActivity: CallFiguresPort,
    private readonly planning: PlannedDoctorsPort,
  ) {}

  async month(input: { actor: { id: string; role: string }; month: string; userId?: string | undefined }): Promise<DoctorVisitsReportDto> {
    const employees = await this.audience(input.actor, input.userId);
    const figures = await this.fieldActivity.callFigures(monthRange(input.month), employees.map((e) => e.id));
    const calls = new Map(figures.doctorCalls.map((c) => [`${c.userId}|${c.doctorId}`, c.count]));
    const mrs = (
      await Promise.all(
        employees.map(async (e): Promise<DoctorVisitMrDto | null> => {
          const tracked = (await this.master.listAssignedDoctors(e.id)).filter((d) => d.visitFrequency != null);
          if (tracked.length === 0) return null;
          const planned = new Map((await this.planning.listPlannedDoctors(e.id, input.month)).map((p) => [p.doctorId, p]));
          const rows = tracked
            .map((d) => {
              const frequency = d.visitFrequency!;
              const made = Math.min(calls.get(`${e.id}|${d.id}`) ?? 0, frequency);
              return { doctor: { id: d.id, name: d.name, specialty: d.specialty }, frequency, made, missed: frequency - made, stage: made >= frequency ? ('COMPLETE' as const) : made > 0 ? ('IN_PROGRESS' as const) : ('NOT_STARTED' as const), plannedDays: planned.get(d.id)?.plannedDays ?? 0, missedSince: planned.get(d.id)?.missedSince ?? null };
            })
            .sort((a, b) => b.missed - a.missed || a.doctor.name.localeCompare(b.doctor.name));
          const quota = rows.reduce((n, r) => n + r.frequency, 0);
          const made = rows.reduce((n, r) => n + r.made, 0);
          return { mr: { id: e.id, name: e.name, employeeCode: e.employeeCode }, quota, made, missed: quota - made, doctors: rows.length, completedDoctors: rows.filter((r) => r.missed === 0).length, notCalled: rows.filter((r) => r.stage === 'NOT_STARTED').length, carried: rows.filter((r) => r.missedSince !== null).length, rows };
        }),
      )
    )
      .filter((m): m is DoctorVisitMrDto => m !== null)
      .sort((a, b) => b.missed - a.missed || a.mr.name.localeCompare(b.mr.name));
    const totals = mrs.reduce(
      (t, m) => ({ quota: t.quota + m.quota, made: t.made + m.made, missed: t.missed + m.missed, doctors: t.doctors + m.doctors, completedDoctors: t.completedDoctors + m.completedDoctors, notCalled: t.notCalled + m.notCalled, carried: t.carried + m.carried }),
      { quota: 0, made: 0, missed: 0, doctors: 0, completedDoctors: 0, notCalled: 0, carried: 0 },
    );
    return { month: input.month, mrs, totals };
  }

  /** Who the reader may see. A named employee must be in that set, else 403. */
  private async audience(actor: { id: string; role: string }, userId?: string) {
    let allowed: Array<{ id: string; name: string; employeeCode: string }>;
    if (actor.role === 'ADMIN') {
      allowed = await this.roster.listFieldEmployees(userId ? [userId] : undefined);
      if (userId && allowed.length === 0) throw AppError.notFound('No such field employee.');
      return allowed;
    }
    if (actor.role !== 'FIELD') throw AppError.forbidden();
    const ids = [actor.id, ...(await this.roster.getDownline(actor.id)).map((d) => d.id)];
    if (userId && !ids.includes(userId)) throw AppError.forbidden('You can only see yourself and your team.');
    allowed = await this.roster.listFieldEmployees(userId ? [userId] : ids);
    return allowed;
  }
}
