import type { RoleName } from '@greynote/contracts';

/**
 * `SUBMITTED` waits on the submitter's manager; `MANAGER_APPROVED` waits on the kind's final
 * approvers (Admin, or HR/Admin for Leave). `APPROVED` and `REJECTED` are decided. `WITHDRAWN`
 * is the submitter pulling it back (Phase 3 step 3).
 */
export const APPROVAL_STATUSES = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Whether a kind needs its final stage at all — per-kind, Admin-editable (decision-log 2026-09-24). */
export const APPROVAL_WORKFLOWS = ['MANAGER_THEN_FINAL', 'MANAGER_ONLY'] as const;
export type ApprovalWorkflow = (typeof APPROVAL_WORKFLOWS)[number];

export const APPROVAL_ACTIONS = ['SUBMIT', 'APPROVE', 'REJECT'] as const;
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
  submittedAt: Date;
  decidedAt: Date | null;
  history: ApprovalAction[];
}

export const isOpen = (status: ApprovalStatus): boolean => status === 'SUBMITTED' || status === 'MANAGER_APPROVED';
