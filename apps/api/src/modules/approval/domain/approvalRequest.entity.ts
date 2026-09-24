import type { RoleName } from '@greynote/contracts';

/**
 * `SUBMITTED` waits on the submitter's manager; `MANAGER_APPROVED` waits on the kind's final
 * approvers (Admin, or HR/Admin for Leave). `APPROVED` and `REJECTED` are decided. `WITHDRAWN`
 * is the submitter pulling it back before the manager acted; `REOPENED` is Admin unlocking an
 * approved request for changes. From `REJECTED`, `WITHDRAWN` or `REOPENED` the submitter can
 * resubmit, which starts a new cycle on the same request.
 */
export const APPROVAL_STATUSES = [
  'SUBMITTED',
  'MANAGER_APPROVED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'REOPENED',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * Whether a request needs the final stage at all. Per kind, Admin-editable through the
 * `APPROVAL_MANAGER_ONLY_KINDS` config key; every kind not listed there is `MANAGER_THEN_FINAL`.
 */
export const APPROVAL_WORKFLOWS = ['MANAGER_THEN_FINAL', 'MANAGER_ONLY'] as const;
export type ApprovalWorkflow = (typeof APPROVAL_WORKFLOWS)[number];

export const APPROVAL_ACTIONS = ['SUBMIT', 'APPROVE', 'REJECT', 'WITHDRAW', 'RESUBMIT', 'REOPEN'] as const;
export type ApprovalActionType = (typeof APPROVAL_ACTIONS)[number];

/**
 * Why the actor was allowed to act — kept on every history entry so the audit trail says, e.g.,
 * that Admin approved over the manager's head rather than as the ordinary final approver.
 */
export const APPROVAL_AUTHORITIES = ['SUBMITTER', 'MANAGER', 'ADMIN_OVERRIDE', 'TOP_OF_CHAIN', 'FINAL'] as const;
export type ApprovalAuthority = (typeof APPROVAL_AUTHORITIES)[number];

export interface ApprovalAction {
  action: ApprovalActionType;
  authority: ApprovalAuthority;
  actorId: string;
  actorRole: RoleName;
  /** Required on REJECT, optional otherwise. */
  comment: string | null;
  at: Date;
  /** The status the request moved to. */
  resultingStatus: ApprovalStatus;
  /** Which submission round this action belongs to (1 = the first submission). */
  cycle: number;
}

/**
 * One approvable thing owned by another module (a Daily Plan, a Leave, …). The owning module
 * keeps its own record; this is the workflow around it, with its full history.
 */
export interface ApprovalRequest {
  id: string;
  /** e.g. `DAILY_PLAN`, `LEAVE` — registered by the owning module. */
  kind: string;
  /** The owning module's record id. One request per (kind, recordId). */
  recordId: string;
  submitterId: string;
  status: ApprovalStatus;
  /** Snapshotted at submission, so a later config change never re-routes a request in flight. */
  workflow: ApprovalWorkflow;
  /** 1 on first submission, +1 on each resubmission. */
  cycle: number;
  /** When the current cycle was submitted. */
  submittedAt: Date;
  decidedAt: Date | null;
  history: ApprovalAction[];
}

/** Waiting on someone to decide. */
export const isOpen = (status: ApprovalStatus): boolean => status === 'SUBMITTED' || status === 'MANAGER_APPROVED';

/**
 * Whether the submitter may change the underlying record and resubmit. Everything else is
 * locked for them: pending (withdraw first) or approved (only Admin can reopen it).
 */
export const isEditableBySubmitter = (status: ApprovalStatus): boolean =>
  status === 'REJECTED' || status === 'WITHDRAWN' || status === 'REOPENED';
