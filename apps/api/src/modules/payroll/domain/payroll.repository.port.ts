import type { PayrollAdjustment, PayrollDraft, PayrollRun, PayrollStatus } from './payrollRun.entity.js';

export interface PayrollFilter {
  month?: string | undefined;
  /** A range of months, both ends included; combines with `month` by intersection. */
  fromMonth?: string | undefined;
  toMonth?: string | undefined;
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
  /** Whether the employee's run for the month is `FINALIZED`. */
  isFinalized(userId: string, month: string): Promise<boolean>;
  /** The employee's run for the month, if there is one. */
  findByUserMonth(userId: string, month: string): Promise<PayrollRun | null>;
  /** `DRAFT` → `FINALIZED` in one conditional update; `false` if the row is not `DRAFT`. */
  finalize(id: string, at: Date, by: string): Promise<boolean>;
  /**
   * HR's change to a draft: replaces the adjustments and the net they give, one conditional update, only while the run is still `DRAFT` and
   * still holds `expectedCount` adjustments (so two edits cannot both win). `false` if it was finalized or changed meanwhile.
   */
  saveAdjustments(id: string, expectedCount: number, next: { adjustments: PayrollAdjustment[]; adjustmentPaise: number; netPayablePaise: number }): Promise<boolean>;
  /** `FINALIZED` and not yet paid → paid, in one conditional update; `false` otherwise. */
  markPaid(id: string, by: string, at: Date, reference: string | null): Promise<boolean>;
}
