import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays } from '@/shared/time/businessTime.js';
import { LOG_CODES, LogRefusal } from '../domain/logRefusal.js';
import type { DoctorCallRepositoryPort, FollowupRepositoryPort } from '../domain/records.repository.port.js';

/** `DOCTOR_VISIT_GAP_DAYS`: 0 to 9 (decision-log 2026-10-22). */
const parseGap = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || n > 9) throw new Error('DOCTOR_VISIT_GAP_DAYS must be a whole number from 0 to 9.');
  return n;
};

const dayLabel = (date: string): string =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));

/**
 * The days between one employee's visits to one doctor (decision-log 2026-10-22): a doctor call or a doctor follow-up on day D and
 * another visit, call or follow-up, must be at least `DOCTOR_VISIT_GAP_DAYS` days apart, in either direction, since the phone can push an
 * earlier day after a later one. With 8, a visit on the 1st allows the next from the 9th; 0 turns the rule off. Per employee, so a
 * manager's joint visit with the MR is theirs to record. A removed record no longer counts; chemists are not affected.
 */
export class DoctorVisitGap {
  constructor(
    private readonly config: ConfigReader,
    private readonly calls: DoctorCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
  ) {}

  async assertAllowed(userId: string, doctorId: string, reportDate: string, ctx?: TransactionContext): Promise<void> {
    const gap = await readConfig(this.config, 'DOCTOR_VISIT_GAP_DAYS', parseGap);
    if (gap === 0) return;
    const range = { from: addDays(reportDate, -(gap - 1)), to: addDays(reportDate, gap - 1) };
    const [calls, followups] = await Promise.all([
      this.calls.listVisitDates(userId, doctorId, range, ctx),
      this.followups.listDoctorVisitDates(userId, doctorId, range, ctx),
    ]);
    const visits = [...new Set([...calls, ...followups])].sort();
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
