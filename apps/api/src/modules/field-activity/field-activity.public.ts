/**
 * The only thing another module may import from `field-activity/`. It grows with the module
 * (docs/LLD/field-activity.md, *Public contract*): Payroll's `getPaidTaDaTotal`, the compliance
 * job's `hasQualifyingDcr` and the reports' `getDcrSummary` arrive with the steps that build the
 * data behind them.
 */
export type FieldActivityPublicContract = Record<string, never>;
