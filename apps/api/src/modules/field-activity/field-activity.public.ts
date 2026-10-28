import type { Expense } from './domain/expense.entity.js';
import type { ExpenseMonthSummary } from './domain/records.repository.port.js';
import type { DcrMonthSummary } from './application/usecases/dcrReports.usecase.js';
import type { DcrSummary } from './application/usecases/getDcrSummary.usecase.js';

export type { Expense } from './domain/expense.entity.js';
export type { ExpenseMonthSummary } from './domain/records.repository.port.js';
export type { DcrMonthSummary } from './application/usecases/dcrReports.usecase.js';
export type { DcrSummary } from './application/usecases/getDcrSummary.usecase.js';

/**
 * The only thing another module may import from `field-activity/`. Money is whole paise, months `YYYY-MM`,
 * dates calendar days (`YYYY-MM-DD`).
 */
export interface FieldActivityPublicContract {
  /**
   * The missed-DCR job's question (HLD 10 §2): did this user report this day? True once their DCR is
   * `SUBMITTED`, `MANAGER_APPROVED` or `APPROVED` (sign-off B7's working assumption: submitted counts).
   * `REJECTED`, `WITHDRAWN`, `REOPENED` and no DCR are all false.
   */
  hasQualifyingDcr(userId: string, date: string): Promise<boolean>;
  /** The days in a range (both ends inclusive) this user reported — `hasQualifyingDcr` for a whole calendar. Sorted. */
  listReportedDates(userId: string, from: string, to: string): Promise<string[]>;
  /**
   * Payroll's input: what was marked `PAID` for this user *during* the month (by paid date in the business timezone, not by
   * report day — a payment made after a month was finalized lands in the next one) — TA, DA, and the manual
   * reimbursements (travel, meals, other) as `reimbursementPaise`. Only `PAID` rows count: an approved but unpaid
   * claim must not reach a payroll run.
   */
  getPaidTaDaTotal(userId: string, month: string): Promise<{ taPaise: number; daPaise: number; reimbursementPaise: number }>;
  /** Among these employees, who has expenses in the month (`YYYY-MM`) but has not sent them to the approver — the reminder job's question. */
  listUnsubmittedExpenseUsers(month: string, userIds: string[]): Promise<string[]>;
  /** The accepted expenses by employee and report month over a date range (both ends inclusive): TA, DA, manual claims, paid and unpaid — the TA/DA report's input. */
  summarizeExpenses(range: { from: string; to: string }): Promise<ExpenseMonthSummary[]>;
  /** The accepted TA and DA of each employee over a date range (both ends inclusive), paid and unpaid together, cancelled left out — the Sales Dashboard's TA and DA columns. */
  summarizeTaDaByUser(range: { from: string; to: string }): Promise<Array<{ userId: string; taPaise: number; daPaise: number }>>;
  /** The accepted expense rows in a date range, oldest day first, at most `limit` (default 2000); optionally one employee's — the report's day-by-day drill-down. */
  listAcceptedExpenses(filter: { from: string; to: string; userId?: string; limit?: number }): Promise<Expense[]>;
  /** Every employee's reported days, calls, follow-ups, geofence results and late submissions by month over a date range — the DCR report's input. */
  summarizeDcrs(range: { from: string; to: string }): Promise<DcrMonthSummary[]>;
  /** Doctor calls per employee per day over a range (both ends inclusive), days with none left out: only calls of a final DCR (approved while `DCR_APPROVAL_REQUIRED` is on, submitted or later when off) — the Attendance calendar's input. */
  countDoctorCallsByDay(range: { from: string; to: string }): Promise<Array<{ userId: string; date: string; count: number }>>;
  /** The Doctors this employee called on in their reported days of a range (both ends inclusive). */
  listCalledDoctorIds(userId: string, range: { from: string; to: string }): Promise<string[]>;
  /** Calls per Doctor in the reported days of a range (both ends inclusive), by any employee — the visit-frequency report's input. */
  countDoctorCalls(range: { from: string; to: string }): Promise<Array<{ doctorId: string; count: number }>>;
  /** What points at one doctor here, for its deactivate/delete warning: calls ever made on it, gifts not handed over, services not done. */
  countDoctorRecords(doctorId: string): Promise<{ calls: number; openGifts: number; openServices: number }>;
  /** The reports' input: this user's DCRs in the range, each with its status, counts and money. */
  getDcrSummary(userId: string, range: { from: string; to: string }): Promise<DcrSummary[]>;
}
