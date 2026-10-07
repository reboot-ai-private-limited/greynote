import type { DcrSummary } from './application/usecases/getDcrSummary.usecase.js';

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
  /** The reports' input: this user's DCRs in the range, each with its status, counts and money. */
  getDcrSummary(userId: string, range: { from: string; to: string }): Promise<DcrSummary[]>;
}
