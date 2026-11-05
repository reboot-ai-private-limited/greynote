import { GATE_CODES, GateRefusal } from '../domain/gateRefusal.js';
import type { Dcr } from '../domain/dcr.entity.js';
import type { DcrRepositoryPort } from '../domain/dcr.repository.port.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { PlanningPort } from '../domain/planning.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import type { DcrClock } from './dcrClock.js';
import type { LateGrant } from '@/modules/lateGrants/lateGrants.public.js';
import type { DcrLatePort } from './dcrLate.port.js';
import type { DcrMonthLock } from './dcrMonthLock.js';
import { DCR_KIND, isOpenForLogging } from './dcrStatus.js';

/**
 * The one check every write of the day goes through (LLD field-activity.md, *Submission gating*; HLD 10):
 * **may this MR log — or submit — anything for this date?** It lives here, in Field Activity, not in
 * Planning, and it's the authority: the phone's cached Plan status is only a UX gate and can be stale
 * (a manager may have rejected the Plan after the last pull).
 *
 * In order: the employee isn't compliance-blocked (`hld/10`) → the day isn't in the future, and is the day
 * the record was made (`clientCreatedAt`, in the business timezone) → the month's Monthly Plan is approved (no approved month, no work) → the day's Plan is past the manager
 * (Planning's `isDailyPlanApproved`, never a status compared here) → the day's DCR isn't already submitted
 * (a rejected, withdrawn or reopened one can be added to again) → the month's salary is not finalized (`PAYROLL_FINALIZED`) → the day is not past the monthly cutoff (`DCR_SUBMIT_CUTOFF_DAY`),
 * unless Admin has allowed it late (`DCR_SUBMIT_LATE`). Refuses with a `GateRefusal` carrying the
 * code the app acts on.
 */
export class LoggingGate {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly planning: PlanningPort,
    private readonly approvals: ApprovalsPort,
    private readonly dcrs: DcrRepositoryPort,
    private readonly clock: DcrClock,
    private readonly late: DcrLatePort | null = null,
    private readonly monthLock: DcrMonthLock | null = null,
  ) {}

  /**
   * Checks the gate and returns the day's DCR, creating the envelope on the first record. `recordedAt`
   * is when the MR made the record on the phone; pass it so a record can't be filed under another day.
   */
  async open(userId: string, reportDate: string, recordedAt: Date): Promise<Dcr> {
    await this.assertMayAct(userId, reportDate, recordedAt);
    const dcr = await this.dcrs.getOrCreate(userId, reportDate);
    if (!isOpenForLogging(await this.approvals.getForRecord(DCR_KIND, dcr.id))) {
      throw new GateRefusal(GATE_CODES.dcrLocked, 'This day’s report has already been submitted, so it can’t be changed.');
    }
    return dcr;
  }

  /**
   * The gate without touching the DCR — for the checks that don't need the envelope. Returns the Admin exception this day is going
   * through on (to be spent by the final submit), or `null` when the day is on time.
   */
  async assertMayAct(userId: string, reportDate: string, recordedAt: Date): Promise<LateGrant | null> {
    await this.clock.assertDayOpen(reportDate);
    if (await this.users.isBlocked(userId)) {
      throw new GateRefusal(GATE_CODES.userBlocked, 'You are blocked for missed reports. Your manager or Admin has to unblock you first.');
    }
    if (reportDate > (await this.clock.today())) {
      throw new GateRefusal(GATE_CODES.dateInFuture, 'A report can’t be for a day that hasn’t happened yet.');
    }
    if ((await this.clock.dateOf(recordedAt)) !== reportDate) {
      throw new GateRefusal(GATE_CODES.dateMismatch, 'This record was made on a different day from the report it is filed under.');
    }
    if (!(await this.planning.isMonthlyPlanApproved(userId, reportDate.slice(0, 7)))) {
      throw new GateRefusal(
        GATE_CODES.monthlyPlanNotApproved,
        `Your monthly plan for ${reportDate.slice(0, 7)} isn’t approved, so nothing can be logged. Ask Admin for a late-submission exception if you missed the deadline.`,
      );
    }
    if (!(await this.planning.isDailyPlanApproved(userId, reportDate))) {
      throw new GateRefusal(GATE_CODES.planNotApproved, 'Today’s tour plan isn’t approved, so nothing can be logged yet.');
    }
    if (this.monthLock && (await this.monthLock.isLocked(userId, reportDate))) {
      throw new GateRefusal(GATE_CODES.payrollFinalized, `Your salary for ${reportDate.slice(0, 7)} is already finalized, so that month’s reports can no longer change.`);
    }
    const lateness = this.late ? await this.late.check(userId, reportDate) : ({ status: 'ON_TIME' } as const);
    if (lateness.status === 'LATE') {
      const by = await this.clock.dateOf(lateness.deadline);
      throw new GateRefusal(GATE_CODES.dcrSubmitLate, `The report for ${reportDate} was due by ${by}. Ask Admin to allow it late.`);
    }
    return lateness.status === 'LATE_ALLOWED' ? lateness.grant : null;
  }
}
