import { parseBoolean, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays } from '@/shared/time/businessTime.js';
import type { LeavePort } from '../../domain/leave.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrClock } from '../dcrClock.js';

/** Why a block was placed — what Admin sees beside the employee in the compliance list. */
export const MISSED_DCR_REASON = 'DCR_MISSED_NO_LEAVE';

/** 0 (block on the first miss) up to a year. */
const parseGraceDays = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 365) throw new RangeError(`Not a whole number from 0 to 365: ${value}`);
  return n;
};

/** Never look further back than this; a month of history is plenty to see a streak, and bounds the work per person. */
const LOOKBACK_DAYS = 31;

export interface MissedDcrRun {
  /** The last completed day the run looked at. */
  through: string;
  enabled: boolean;
  /** A dry run reports who would be blocked and blocks no one. */
  dryRun: boolean;
  graceDays: number;
  checked: number;
  blocked: Array<{ userId: string; missedDates: string[] }>;
  alreadyBlocked: number;
  failed: Array<{ userId: string; message: string }>;
}

/**
 * The missed-DCR compliance job (hld/10 §2, LLD field-activity.md, *The missed-DCR job*). An operator runs it once a
 * day after the day rolls over; it blocks each active FIELD employee who has **missed more than `DCR_MISS_GRACE_DAYS`
 * working days in a row** ending yesterday, and can be run twice, or again after a failure part-way, harmlessly.
 *
 * A day is *missed* when the employee has no submitted report for it (`SUBMITTED`, `MANAGER_APPROVED` or `APPROVED`,
 * sign-off B7) and nothing excuses it. A day is *excused* — skipped, neither counted nor breaking the run — when it
 * is the employee's weekly off or a holiday, is covered by an approved Leave, precedes their joining date, or
 * precedes the day an Admin last cleared a block on them (so an unblocked employee starts with a clean slate
 * instead of being blocked again for the same days). The walk stops at the first reported day.
 *
 * `dryRun` reports without blocking; `userIds` narrows the run to those employees. One employee's failure is
 * recorded and skipped; the rest are still checked.
 */
export class RunMissedDcrCheckUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly leave: LeavePort,
    private readonly hasQualifyingDcr: (userId: string, date: string) => Promise<boolean>,
    private readonly clock: DcrClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(options: { dryRun?: boolean; userIds?: string[] } = {}): Promise<MissedDcrRun> {
    const through = addDays(await this.clock.today(), -1);
    const enabled = await readConfig(this.config, 'DCR_MISS_BLOCK_ENABLED', parseBoolean);
    const graceDays = await readConfig(this.config, 'DCR_MISS_GRACE_DAYS', parseGraceDays);
    const run: MissedDcrRun = { through, enabled, dryRun: options.dryRun ?? false, graceDays, checked: 0, blocked: [], alreadyBlocked: 0, failed: [] };
    if (!enabled) return run;

    const everyone = await this.users.listActiveFieldUserIds();
    for (const userId of options.userIds ? everyone.filter((id) => options.userIds!.includes(id)) : everyone) {
      try {
        run.checked += 1;
        if (await this.users.isBlocked(userId)) {
          run.alreadyBlocked += 1;
          continue;
        }
        const missed = await this.missedRun(userId, through, graceDays);
        if (missed.length <= graceDays) continue;
        const reason = `${MISSED_DCR_REASON}: no report for ${missed.slice().reverse().join(', ')}`;
        if (run.dryRun || (await this.users.blockUser(userId, reason))) run.blocked.push({ userId, missedDates: missed.slice().reverse() });
        else run.alreadyBlocked += 1;
      } catch (err) {
        run.failed.push({ userId, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return run;
  }

  /** The missed working days, newest first, walking back from `through`; stops at a reported day or once the grace is exceeded. */
  private async missedRun(userId: string, through: string, graceDays: number): Promise<string[]> {
    const from = addDays(through, -(LOOKBACK_DAYS - 1));
    const [joined, cleared, off] = await Promise.all([this.users.getEmploymentDetails(userId), this.users.getLastBlockClearedAt(userId), this.leave.listOffDates(userId, from, through)]);
    const offDays = new Set(off);
    const joinedOn = joined?.dateOfJoining ? await this.clock.dateOf(joined.dateOfJoining) : null;
    // The day of the clearing itself is the employee's to work: they are judged from that day on.
    const clearedOn = cleared ? await this.clock.dateOf(cleared) : null;

    const missed: string[] = [];
    for (let day = through; day >= from && missed.length <= graceDays; day = addDays(day, -1)) {
      if ((joinedOn && day < joinedOn) || (clearedOn && day < clearedOn)) break;
      if (offDays.has(day)) continue;
      if (await this.hasQualifyingDcr(userId, day)) break;
      if (await this.leave.isOnLeave(userId, day)) continue;
      missed.push(day);
    }
    return missed;
  }
}
