import type { PayrollFilter } from './domain/payroll.repository.port.js';
import type { GenerateOutcome } from './application/usecases/payroll.usecase.js';
import type { PayrollRun } from './domain/payrollRun.entity.js';

export type { PayrollRun } from './domain/payrollRun.entity.js';
export type { GenerateOutcome } from './application/usecases/payroll.usecase.js';

/**
 * Nothing sits above Payroll in the tier graph, so this exists for its own interface layer and any future reporting
 * surface, not for another module. Months are `YYYY-MM`; money is whole paise.
 */
export interface PayrollPublicContract {
  generate(actor: { id: string; role: string }, input: { month: string; userIds?: string[] }): Promise<GenerateOutcome[]>;
  finalize(payrollRunId: string): Promise<PayrollRun>;
  get(payrollRunId: string): Promise<PayrollRun>;
  list(filter: PayrollFilter): Promise<PayrollRun[]>;
  /** Whether this employee's salary run for the month (`YYYY-MM`) is finalized: HR locks that month's leave on it. */
  isMonthFinalized(userId: string, month: string): Promise<boolean>;
}
