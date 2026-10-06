import { readConfig, parseBoolean, type ConfigReader } from '@/shared/config/readConfig.js';
import { AppError } from '@/shared/errors/AppError.js';

/** Whether this employee's salary run for a `YYYY-MM` month is finalized. Payroll sits above HR, so the top-level wiring supplies it. */
export type PayrollFinalizedCheck = (userId: string, month: string) => Promise<boolean>;

/**
 * Once an employee's salary for a month is finalized, their leave in that month can no longer change (decision-log 2026-10-06): no
 * new request, no edit, no approval and no reopening. Daily reports and expenses are not locked. The setting `LEAVE_LOCKED_AFTER_PAYROLL`
 * switches it off. Until Payroll is bound (tests, a script) nothing is locked.
 */
export class LeaveLock {
  private finalized: PayrollFinalizedCheck | null = null;

  constructor(private readonly config: ConfigReader) {}

  bind(check: PayrollFinalizedCheck): void {
    this.finalized = check;
  }

  /** `dates` are `YYYY-MM-DD`; refuses when any falls in a month already finalized for the employee. */
  async assertUnlocked(userId: string, dates: readonly string[]): Promise<void> {
    if (!this.finalized || dates.length === 0) return;
    if (!(await readConfig(this.config, 'LEAVE_LOCKED_AFTER_PAYROLL', parseBoolean))) return;
    for (const month of [...new Set(dates.map((d) => d.slice(0, 7)))].sort()) {
      if (await this.finalized(userId, month)) {
        throw AppError.conflict(`The salary for ${month} is already finalized, so leave in that month can no longer change.`, { code: 'PAYROLL_FINALIZED', month });
      }
    }
  }
}
