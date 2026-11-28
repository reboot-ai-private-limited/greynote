import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays } from '@/shared/time/businessTime.js';
import { LOG_CODES, LogRefusal } from '../domain/logRefusal.js';
import type { DoctorCallRepositoryPort } from '../domain/records.repository.port.js';

/** `DOCTOR_VISIT_GAP_DAYS`: 0 to 9 (decision-log 2026-10-22). */
const parseGap = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || n > 9) throw new Error('DOCTOR_VISIT_GAP_DAYS must be a whole number from 0 to 9.');
  return n;
};

const dayLabel = (date: string): string =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));

/**
 * The days between one employee's calls on one doctor (decision-log 2026-10-22): a doctor call on day D and another call on that
 * doctor must be at least `DOCTOR_VISIT_GAP_DAYS` days apart, in either direction, since the phone can push an earlier day after a
 * later one. A follow-up is neither held back nor counted (2026-11-28): it is a note, so the employee can always add one. With 8, a visit on the 1st allows the next from the 9th; 0 turns the rule off. Per employee, so a
 * manager's joint visit with the MR is theirs to record. A removed record no longer counts; chemists are not affected.
 */
export class DoctorVisitGap {
  constructor(
    private readonly config: ConfigReader,
    private readonly calls: DoctorCallRepositoryPort,
  ) {}

  async assertAllowed(userId: string, doctorId: string, reportDate: string, ctx?: TransactionContext): Promise<void> {
    const gap = await readConfig(this.config, 'DOCTOR_VISIT_GAP_DAYS', parseGap);
    if (gap === 0) return;
    const range = { from: addDays(reportDate, -(gap - 1)), to: addDays(reportDate, gap - 1) };
    const visits = [...new Set(await this.calls.listVisitDates(userId, doctorId, range, ctx))].sort();
    if (visits.length === 0) return;
    // The nearest visit on or before the day explains it best; failing that, the first one after it.
    const earlier = visits.filter((d) => d <= reportDate);
    const clash = earlier.length > 0 ? earlier[earlier.length - 1]! : visits[0]!;
    const nextAllowed = addDays(clash, gap);
    throw new LogRefusal(
      LOG_CODES.doctorVisitTooSoon,
      clash <= reportDate
        ? `You visited this doctor on ${dayLabel(clash)}. The next visit can be from ${dayLabel(nextAllowed)} (${gap} days apart).`
        : `You already have a visit to this doctor on ${dayLabel(clash)}, less than ${gap} days after this one.`,
      { lastVisit: clash, nextAllowed, gapDays: String(gap) },
    );
  }
}
