import { expenseMonthDeadline } from '@/shared/time/businessTime.js';
import { parsePositiveInt, readBusinessDay, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';

/** Seeded defaults, used while a database has not been re-seeded since the keys were added. */
const DEFAULT_SUBMIT_DAY = 7;
const DEFAULT_APPROVAL_DAY = 10;

/**
 * When a month of expenses must be sent by the employee and approved by the manager (decision-log 2026-10-12): the end of a
 * business day of the following month, `EXPENSE_SUBMIT_CUTOFF_DAY` and `EXPENSE_APPROVAL_CUTOFF_DAY`. Read from Config on every call
 * so an Admin's change applies at once. The approval deadline is never earlier than the submit one.
 */
export class ExpenseMonthDeadlines {
  constructor(
    private readonly config: ConfigReader,
    readonly now: () => Date = () => new Date(),
  ) {}

  async submit(month: string): Promise<Date> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return expenseMonthDeadline(month, await this.submitDay(), timeZone, dayStart);
  }

  async approval(month: string): Promise<Date> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const day = Math.max(await this.approvalDay(), await this.submitDay());
    return expenseMonthDeadline(month, day, timeZone, dayStart);
  }

  private submitDay(): Promise<number> {
    return readConfigOr(this.config, 'EXPENSE_SUBMIT_CUTOFF_DAY', parsePositiveInt(28), DEFAULT_SUBMIT_DAY);
  }

  private approvalDay(): Promise<number> {
    return readConfigOr(this.config, 'EXPENSE_APPROVAL_CUTOFF_DAY', parsePositiveInt(28), DEFAULT_APPROVAL_DAY);
  }
}
