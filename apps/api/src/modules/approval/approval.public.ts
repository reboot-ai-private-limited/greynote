import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SubmitApprovalInput } from './application/usecases/submitApproval.usecase.js';
import type { WaitingOnManager } from './application/usecases/listApprovals.usecase.js';
import type { ApprovalKindDefinition } from './domain/approvalKind.js';
import type { ApprovalRequest } from './domain/approvalRequest.entity.js';

export type { ApprovalKindDefinition, ApprovalStatusChange, ApprovalSubject } from './domain/approvalKind.js';
export type { WaitingOnManager } from './application/usecases/listApprovals.usecase.js';
export type { ApprovalRequest, ApprovalStatus } from './domain/approvalRequest.entity.js';
/** Helpers for a kind's `describeRecords`: the title of a day or month, and a describer for records read one by one. */
export { dayTitle, describeEach, monthTitle } from './application/subjects.js';
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
  /** Requests waiting at Stage 1 whose submitter has a manager, oldest first — with the manager, the due time and whether it is past it. Alerts read this. */
  listWaitingOnManagers(filter?: { kinds?: string[]; submittedFrom?: Date }): Promise<WaitingOnManager[]>;
  /** Removes the request (and its history) of a record that is being deleted for good. */
  deleteForRecord(kind: string, recordId: string, ctx?: TransactionContext): Promise<void>;
  /** Rejects a still-open request on the owning module's behalf (e.g. a leave that started unapproved); false if it was not open. */
  autoReject(kind: string, recordId: string, reason: string): Promise<boolean>;
}
