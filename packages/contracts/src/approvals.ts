/**
 * Approval requests over HTTP. One row shape serves the open queue (`/inbox`), the History (`/all`) and the
 * manager lists, so the portal and the app render one component. Dates are ISO strings on the wire.
 */
export const APPROVAL_STATUSES = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REOPENED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Whether a request needs the final stage at all, fixed for each cycle when it is submitted. */
export type ApprovalWorkflow = 'MANAGER_THEN_FINAL' | 'MANAGER_ONLY';

export type ApprovalActionType = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'WITHDRAW' | 'RESUBMIT' | 'REOPEN';

/** Why the actor was allowed to act: an Admin approving over the manager's head says so. */
export type ApprovalAuthority = 'SUBMITTER' | 'MANAGER' | 'ADMIN_OVERRIDE' | 'TOP_OF_CHAIN' | 'FINAL';

export interface ApprovalPersonDto {
  id: string;
  employeeCode: string;
  name: string;
}

export interface ApprovalActionDto {
  action: ApprovalActionType;
  authority: ApprovalAuthority;
  actorRole: string;
  /** Required on a rejection. */
  comment: string | null;
  at: string;
  /** The status the request moved to. */
  resultingStatus: ApprovalStatus;
  /** Which submission round this belongs to (1 = the first). */
  cycle: number;
  actor: ApprovalPersonDto | null;
}

/** One row of `GET /approvals/inbox` and `GET /approvals/all`. */
export interface ApprovalInboxItemDto {
  id: string;
  /** `NEW_DOCTOR`, `LEAVE`, `DCR`, … registered by the owning module. */
  kind: string;
  /** The owning module's record id. */
  recordId: string;
  status: ApprovalStatus;
  workflow: ApprovalWorkflow;
  cycle: number;
  submittedAt: string;
  decidedAt: string | null;
  submitter: ApprovalPersonDto | null;
  lastAction: ApprovalActionDto;
  /** Whether the caller may approve or reject it right now. */
  canAct: boolean;
}

/** `GET /approvals/:id`: the row, with the full named history and what the caller may do. */
export interface ApprovalDetailDto extends ApprovalInboxItemDto {
  history: ApprovalActionDto[];
  canWithdraw: boolean;
  canReopen: boolean;
}

/** `cycle` is the one displayed: a request resubmitted since then is a 409 telling you to reload. */
export interface ApproveDto {
  cycle: number;
  comment?: string;
}
export interface RejectDto {
  cycle: number;
  /** Required. */
  comment: string;
}
export interface ReopenDto {
  /** Required. */
  comment: string;
}

export const MAX_BULK_DECISIONS = 100;

export interface BulkDecideDto {
  decision: 'APPROVE' | 'REJECT';
  requests: { id: string; cycle: number }[];
  /** Required when rejecting. */
  comment?: string;
}

export type BulkResultDto =
  | { requestId: string; ok: true; status: ApprovalStatus }
  | { requestId: string; ok: false; statusCode: number; message: string };

export interface BulkDecideResponseDto {
  results: BulkResultDto[];
}
