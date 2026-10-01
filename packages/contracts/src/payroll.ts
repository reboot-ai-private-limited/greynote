export type PayrollStatus = 'DRAFT' | 'FINALIZED';

/** One row of `GET /payroll` — a bare array, capped at 1000. No employee name on the row. */
export interface PayrollRunDto {
  id: string;
  userId: string;
  /** `YYYY-MM`. */
  month: string;
  netPayablePaise: number;
  status: PayrollStatus;
  generatedAt: string;
  finalizedAt: string | null;
}
