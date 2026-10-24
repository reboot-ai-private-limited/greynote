import type { RoleName } from '@greynote/contracts';
import type { ApprovalKindDefinition } from './approvalKind.js';
import type { ApprovalAuthority, ApprovalRequest, ApprovalStatus } from './approvalRequest.entity.js';

export interface Actor {
  id: string;
  role: RoleName;
}

/** Admin always; any other role only when the kind names it in `overrideRoles`. */
export function canOverride(kind: ApprovalKindDefinition | undefined, role: RoleName): boolean {
  return role === 'ADMIN' || (kind?.overrideRoles?.includes(role) ?? false);
}

/**
 * Who may approve or reject `request` right now, and in what capacity — `null` if `actor` may
 * not. Pure: the caller supplies the submitter's CURRENT manager (resolved live, so a reassigned
 * employee's pending requests follow them to the new manager).
 *
 * - `SUBMITTED` → the submitter's manager; or, when the submitter has no manager (top of chain),
 *   the kind's final approvers; or Admin (and the kind's `overrideRoles`) at any time (standing override, HLD 05 §5).
 * - `MANAGER_APPROVED` → the kind's final approvers only.
 * - Nobody ever acts on their own request.
 */
export function resolveAuthority(
  request: Pick<ApprovalRequest, 'status' | 'submitterId'>,
  actor: Actor,
  submitterManagerId: string | null,
  kind: ApprovalKindDefinition,
): Exclude<ApprovalAuthority, 'SUBMITTER'> | null {
  if (actor.id === request.submitterId) return null;
  const isFinalApprover = kind.finalApproverRoles.includes(actor.role);

  if (request.status === 'SUBMITTED') {
    if (submitterManagerId !== null && actor.id === submitterManagerId) return 'MANAGER';
    if (submitterManagerId === null && isFinalApprover) return 'TOP_OF_CHAIN';
    if (canOverride(kind, actor.role)) return 'ADMIN_OVERRIDE';
    return null;
  }
  if (request.status === 'MANAGER_APPROVED') return isFinalApprover ? 'FINAL' : null;
  return null;
}

/**
 * Where an approval leads. Only the manager's own approval can stop at `MANAGER_APPROVED`, and
 * only when the workflow has a final stage. Every other authority IS the final word: a top-of-
 * chain request has no separate second stage (PRD §7.1.4), and Admin overriding the manager is
 * already the final approver, so making them approve twice would add a click, not a check.
 */
export function statusAfterApproval(
  authority: Exclude<ApprovalAuthority, 'SUBMITTER'>,
  workflow: ApprovalRequest['workflow'],
): ApprovalStatus {
  return authority === 'MANAGER' && workflow === 'MANAGER_THEN_FINAL' ? 'MANAGER_APPROVED' : 'APPROVED';
}

/** `APPROVAL_MANAGER_ONLY_KINDS` → the set of kinds that skip the final stage. */
export function parseManagerOnlyKinds(value: string): Set<string> {
  const kinds = value
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k !== '' && k !== 'NONE');
  return new Set(kinds);
}
