/**
 * The only thing another module may import from `field-activity/`. It grows with the module
 * (docs/LLD/field-activity.md, *Public contract*): Payroll's `getPaidTaDaTotal` and the reports'
 * `getDcrSummary` arrive with the steps that build the data behind them.
 */
export interface FieldActivityPublicContract {
  /**
   * The missed-DCR job's question (HLD 10 §2): did this user report this day? True once their DCR is
   * `SUBMITTED`, `MANAGER_APPROVED` or `APPROVED` (sign-off B7's working assumption: submitted counts).
   * `REJECTED`, `WITHDRAWN`, `REOPENED` and no DCR are all false.
   */
  hasQualifyingDcr(userId: string, date: string): Promise<boolean>;
}
