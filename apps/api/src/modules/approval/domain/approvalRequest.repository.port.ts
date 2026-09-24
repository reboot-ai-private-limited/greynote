import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ApprovalAction, ApprovalRequest, ApprovalStatus, ApprovalWorkflow } from './approvalRequest.entity.js';

export interface ApprovalTransition {
  status: ApprovalStatus;
  decidedAt: Date | null;
  action: ApprovalAction;
  /** Set only by a resubmission, which starts a new cycle. */
  newCycle?: { cycle: number; workflow: ApprovalWorkflow; submittedAt: Date };
}

export interface ApprovalListFilter {
  statuses?: ApprovalStatus[] | undefined;
  kinds?: string[] | undefined;
  submitterIds?: string[] | undefined;
  submittedFrom?: Date | undefined;
  submittedTo?: Date | undefined;
}

export interface ApprovalListPage {
  /** Omit to get every match (callers cap this themselves). */
  page?: number;
  pageSize?: number;
  /** By `submittedAt`: queues show the longest-waiting first, history screens the newest. */
  sortOrder: 'asc' | 'desc';
}

export interface ApprovalRequestRepositoryPort {
  list(filter: ApprovalListFilter, page: ApprovalListPage): Promise<{ items: ApprovalRequest[]; total: number }>;
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
