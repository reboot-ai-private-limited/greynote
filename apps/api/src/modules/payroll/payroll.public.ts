import type { PayrollFilter } from './domain/payroll.repository.port.js';
import type { GenerateOutcome } from './application/usecases/payroll.usecase.js';
import type { PayrollRun } from './domain/payrollRun.entity.js';

export type { PayrollRun } from './domain/payrollRun.entity.js';
export type { GenerateOutcome } from './application/usecases/payroll.usecase.js';

/** One run, light, for a report: the figures a salary report adds up, and the employer's monthly contributions (the CTC's employer lines ÷ 12). */
export interface PayrollReportRow {
  runId: string;
  userId: string;
  /** `YYYY-MM`. */
  month: string;
  status: 'DRAFT' | 'FINALIZED';
  baseSalaryPaise: number;
  leaveDeductionPaise: number;
  absentDeductionPaise: number;
  netPayablePaise: number;
  /** The employer's EPF/ESI and the like for the month, from the frozen CTC breakdown; 0 on a run from before CTC existed. */
  employerContributionPaise: number;
}

/**
 * Nothing sits above Payroll in the tier graph, so this exists for its own interface layer and any future reporting
 * surface, not for another module. Months are `YYYY-MM`; money is whole paise.
 */
export interface PayrollPublicContract {
  generate(actor: { id: string; role: string }, input: { month: string; userIds?: string[] }): Promise<GenerateOutcome[]>;
  finalize(payrollRunId: string): Promise<PayrollRun>;
  get(payrollRunId: string): Promise<PayrollRun>;
  list(filter: PayrollFilter): Promise<PayrollRun[]>;
  /** Every run in a range of months (both ends inclusive), light, newest month first — a report's read, with no cap of 1000. */
  listRunsForReport(range: { fromMonth: string; toMonth: string }): Promise<PayrollReportRow[]>;
  /** Whether this employee's salary run for the month (`YYYY-MM`) is finalized: HR locks that month's leave on it. */
  isMonthFinalized(userId: string, month: string): Promise<boolean>;
}
