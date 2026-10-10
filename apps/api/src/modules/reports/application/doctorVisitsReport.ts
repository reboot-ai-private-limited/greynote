import type { DoctorVisitMrDto, DoctorVisitsReportDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { DoctorCallsPort, FieldRosterPort, MasterPort } from '../domain/ports.js';

/**
 * Each Doctor's visit frequency against the calls made on reported days of a month: per employee the quota, calls made
 * and calls missed, and per Doctor the same. Only Doctors with a frequency count. Calls above a Doctor's frequency don't
 * offset another Doctor's missed ones (`made` is capped per Doctor). Admin reads any employee; a manager reads themself
 * and their downline; any other employee reads only themself. Reads only.
 */
export class DoctorVisitsReport {
  constructor(
    private readonly roster: FieldRosterPort,
    private readonly master: MasterPort,
    private readonly fieldActivity: DoctorCallsPort,
  ) {}

  async month(input: { actor: { id: string; role: string }; month: string; userId?: string | undefined }): Promise<DoctorVisitsReportDto> {
    const employees = await this.audience(input.actor, input.userId);
    const calls = new Map((await this.fieldActivity.countDoctorCalls(monthRange(input.month))).map((c) => [c.doctorId, c.count]));
    const mrs = (
      await Promise.all(
        employees.map(async (e): Promise<DoctorVisitMrDto | null> => {
          const tracked = (await this.master.listAssignedDoctors(e.id)).filter((d) => d.visitFrequency != null);
          if (tracked.length === 0) return null;
          const rows = tracked
            .map((d) => {
              const frequency = d.visitFrequency!;
              const made = Math.min(calls.get(d.id) ?? 0, frequency);
              return { doctor: { id: d.id, name: d.name, specialty: d.specialty }, frequency, made, missed: frequency - made };
            })
            .sort((a, b) => b.missed - a.missed || a.doctor.name.localeCompare(b.doctor.name));
          const quota = rows.reduce((n, r) => n + r.frequency, 0);
          const made = rows.reduce((n, r) => n + r.made, 0);
          return { mr: { id: e.id, name: e.name, employeeCode: e.employeeCode }, quota, made, missed: quota - made, doctors: rows.length, completedDoctors: rows.filter((r) => r.missed === 0).length, rows };
        }),
      )
    )
      .filter((m): m is DoctorVisitMrDto => m !== null)
      .sort((a, b) => b.missed - a.missed || a.mr.name.localeCompare(b.mr.name));
    const totals = mrs.reduce(
      (t, m) => ({ quota: t.quota + m.quota, made: t.made + m.made, missed: t.missed + m.missed, doctors: t.doctors + m.doctors, completedDoctors: t.completedDoctors + m.completedDoctors }),
      { quota: 0, made: 0, missed: 0, doctors: 0, completedDoctors: 0 },
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
