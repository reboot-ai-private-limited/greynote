import type { PayrollDraft, PayrollRun, PayrollStatus } from './payrollRun.entity.js';

export interface PayrollFilter {
  month?: string | undefined;
  userId?: string | undefined;
  status?: PayrollStatus | undefined;
}

export type SaveDraftResult = { outcome: 'created' | 'updated'; run: PayrollRun } | { outcome: 'finalized' };

export interface PayrollRunRepositoryPort {
  /**
   * Creates the `DRAFT` run for this user and month, or recomputes the existing `DRAFT` one. The overwrite is
   * conditional on the row still being `DRAFT`, so a finalize that commits first is never overwritten: that comes back
   * as `finalized` and nothing changes.
   */
  saveDraft(draft: PayrollDraft): Promise<SaveDraftResult>;
  findById(id: string): Promise<PayrollRun | null>;
  list(filter: PayrollFilter, limit: number): Promise<PayrollRun[]>;
  /** `DRAFT` → `FINALIZED` in one conditional update; `false` if the row is not `DRAFT`. */
  finalize(id: string, at: Date): Promise<boolean>;
}
