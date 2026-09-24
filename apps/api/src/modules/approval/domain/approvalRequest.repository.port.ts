import type { ApprovalAction, ApprovalRequest, ApprovalStatus } from './approvalRequest.entity.js';

export interface ApprovalRequestRepositoryPort {
  findById(id: string): Promise<ApprovalRequest | null>;
  findByRecord(kind: string, recordId: string): Promise<ApprovalRequest | null>;
  /** Throws a 409 if a request for this (kind, recordId) already exists. */
  create(input: Omit<ApprovalRequest, 'id'>): Promise<ApprovalRequest>;
  /**
   * Moves the request to `change.status` and appends `change.action` — only if it is still in
   * `expectedStatus`. Returns null when it isn't: someone else decided first.
   */
  transition(
    id: string,
    expectedStatus: ApprovalStatus,
    change: { status: ApprovalStatus; decidedAt: Date | null; action: ApprovalAction },
  ): Promise<ApprovalRequest | null>;
}
