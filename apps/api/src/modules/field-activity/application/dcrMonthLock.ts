import { AppError } from '@/shared/errors/AppError.js';

/** Whether this employee's salary run for a `YYYY-MM` month is finalized. Payroll sits above Field Activity, so the top-level wiring supplies it. */
export type PayrollFinalizedCheck = (userId: string, month: string) => Promise<boolean>;

/**
 * Once an employee's salary for a month is finalized, nothing in that month's daily reports can change (decision-log 2026-11-05): no new
 * call, follow-up or expense, no removal, no submit, and no approval, rejection, withdrawal or reopening. Until Payroll is bound (tests, a
 * script) nothing is locked.
 */
export class DcrMonthLock {
  private finalized: PayrollFinalizedCheck | null = null;

  bind(check: PayrollFinalizedCheck): void {
    this.finalized = check;
  }

  /** `reportDate` is `YYYY-MM-DD`. */
  async isLocked(userId: string, reportDate: string): Promise<boolean> {
    return this.finalized ? this.finalized(userId, reportDate.slice(0, 7)) : false;
  }

  /** For the actions that answer with an HTTP error rather than a gate refusal. */
  async assertUnlocked(userId: string, reportDate: string): Promise<void> {
    if (await this.isLocked(userId, reportDate)) {
      const month = reportDate.slice(0, 7);
      throw AppError.conflict(`The salary for ${month} is already finalized, so that month’s daily reports can no longer change.`, { code: 'PAYROLL_FINALIZED', month });
    }
  }
}
