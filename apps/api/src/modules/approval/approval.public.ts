import type { SubmitApprovalInput } from './application/usecases/submitApproval.usecase.js';
import type { ApprovalKindDefinition } from './domain/approvalKind.js';
import type { ApprovalRequest } from './domain/approvalRequest.entity.js';

export type { ApprovalKindDefinition } from './domain/approvalKind.js';
export type { ApprovalRequest, ApprovalStatus } from './domain/approvalRequest.entity.js';

/**
 * The only thing another module may import from `approval/`. An owning module registers its
 * kinds once at boot, submits its records, and reads a record's request back. Approving and
 * rejecting happen over this module's own HTTP surface, not through the contract.
 */
export interface ApprovalPublicContract {
  registerKind(definition: ApprovalKindDefinition): void;
  submit(input: SubmitApprovalInput): Promise<ApprovalRequest>;
  getForRecord(kind: string, recordId: string): Promise<ApprovalRequest | null>;
}
