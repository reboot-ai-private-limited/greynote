import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays } from '@/shared/time/businessTime.js';
import type { DoctorCallRepositoryPort, FollowupRepositoryPort } from '../domain/records.repository.port.js';

/** `DOCTOR_VISIT_GAP_DAYS`: 0 to 9 (decision-log 2026-10-22). */
const parseGap = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || n > 9) throw new Error('DOCTOR_VISIT_GAP_DAYS must be a whole number from 0 to 9.');
  return n;
};

const dayLabel = (date: string): string =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));

/** A visit sooner than `DOCTOR_VISIT_GAP_DAYS` allows: the counted visit it is near, when the next counted one can be, and the gap. */
export interface ExtraVisit {
  lastVisit: string;
  nextAllowed: string;
  gapDays: number;
  /** For the employee: why it won't be counted. */
  message: string;
}

/**
 * The days between one employee's visits to one doctor (decision-log 2026-10-22; allowed but not counted since 2026-11-28): a doctor
 * call or follow-up within `DOCTOR_VISIT_GAP_DAYS` days of another *counted* visit, in either direction (the phone can push an earlier
 * day after a later one), is an extra visit. It is kept and shown, but left out of frequency, call average and coverage. With 8, a
 * visit on the 1st makes the next counted one from the 9th; 0 turns the rule off. Per employee, so a manager's joint visit with the MR
 * is theirs to record. A removed record no longer counts; chemists are not affected.
 */
export class DoctorVisitGap {
  constructor(
    private readonly config: ConfigReader,
    private readonly calls: DoctorCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
  ) {}

  /** Null when the visit counts; otherwise the counted visit it came too close to. */
  async check(userId: string, doctorId: string, reportDate: string, ctx?: TransactionContext): Promise<ExtraVisit | null> {
    const gap = await readConfig(this.config, 'DOCTOR_VISIT_GAP_DAYS', parseGap);
    if (gap === 0) return null;
    const range = { from: addDays(reportDate, -(gap - 1)), to: addDays(reportDate, gap - 1) };
    const [calls, followups] = await Promise.all([
      this.calls.listVisitDates(userId, doctorId, range, ctx),
      this.followups.listDoctorVisitDates(userId, doctorId, range, ctx),
    ]);
    const visits = [...new Set([...calls, ...followups])].sort();
    if (visits.length === 0) return null;
    // The nearest visit on or before the day explains it best; failing that, the first one after it.
    const earlier = visits.filter((d) => d <= reportDate);
    const clash = earlier.length > 0 ? earlier[earlier.length - 1]! : visits[0]!;
    const nextAllowed = addDays(clash, gap);
    return {
      lastVisit: clash,
      nextAllowed,
      gapDays: gap,
      message:
        clash <= reportDate
          ? `Extra visit: you visited this doctor on ${dayLabel(clash)}. It is saved, but not counted; the next counted visit can be from ${dayLabel(nextAllowed)}.`
          : `Extra visit: you have a counted visit to this doctor on ${dayLabel(clash)}, less than ${gap} days after this one. It is saved, but not counted.`,
    };
  }
}
