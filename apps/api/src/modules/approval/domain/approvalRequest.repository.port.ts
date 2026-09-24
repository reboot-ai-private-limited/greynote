import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ApprovalAction, ApprovalRequest, ApprovalStatus, ApprovalWorkflow } from './approvalRequest.entity.js';

export interface ApprovalTransition {
  status: ApprovalStatus;
  decidedAt: Date | null;
  action: ApprovalAction;
  /** Set only by a resubmission, which starts a new cycle. */
  newCycle?: { cycle: number; workflow: ApprovalWorkflow; submittedAt: Date };
}

export interface ApprovalRequestRepositoryPort {
  findById(id: string): Promise<ApprovalRequest | null>;
  findByRecord(kind: string, recordId: string): Promise<ApprovalRequest | null>;
  /** Throws a 409 if a request for this (kind, recordId) already exists. */
  create(input: Omit<ApprovalRequest, 'id'>, ctx?: TransactionContext): Promise<ApprovalRequest>;
  /**
   * Applies `change` and appends its action — only if the request is still in `expectedStatus`.
   * Returns null when it isn't: someone else acted first.
   */
  transition(
    id: string,
    expectedStatus: ApprovalStatus,
    change: ApprovalTransition,
    ctx?: TransactionContext,
  ): Promise<ApprovalRequest | null>;
}
