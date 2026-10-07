import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SubmitApprovalInput } from './application/usecases/submitApproval.usecase.js';
import type { ApprovalKindDefinition } from './domain/approvalKind.js';
import type { ApprovalRequest } from './domain/approvalRequest.entity.js';

export type { ApprovalKindDefinition, ApprovalStatusChange } from './domain/approvalKind.js';
export type { ApprovalRequest, ApprovalStatus } from './domain/approvalRequest.entity.js';
/** Whether the submitter may edit the record behind a request with this status. */
export { isEditableBySubmitter } from './domain/approvalRequest.entity.js';

/**
 * The only thing another module may import from `approval/`. An owning module registers its
 * kinds once at boot (with an `onStatusChange` to react to decisions), submits — or resubmits —
 * its records, and reads a record's request back. Approving, rejecting, withdrawing and reopening
 * happen over this module's own HTTP surface, not through the contract.
 */
export interface ApprovalPublicContract {
  registerKind(definition: ApprovalKindDefinition): void;
  /** First submission, or a resubmission after REJECTED / WITHDRAWN / REOPENED. */
  submit(input: SubmitApprovalInput, ctx?: TransactionContext): Promise<ApprovalRequest>;
  getForRecord(kind: string, recordId: string): Promise<ApprovalRequest | null>;
  /** The requests of one kind for a batch of records in one query — a report's read; a record with no request is left out. */
  listForRecords(kind: string, recordIds: string[]): Promise<ApprovalRequest[]>;
}
