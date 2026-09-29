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
  /**
   * Payroll's input: the TA and DA `PAID` for this user's report days in the month. Only `PAID` rows count — an
   * approved but unpaid claim must not reach a payroll run. Manual reimbursements (travel, meals, other) are
   * not included.
   */
  getPaidTaDaTotal(userId: string, month: string): Promise<{ taPaise: number; daPaise: number }>;
  /** The reports' input: this user's DCRs in the range, each with its status, counts and money. */
  getDcrSummary(userId: string, range: { from: string; to: string }): Promise<DcrSummary[]>;
}
