/** Kinds that went from "manager, then Admin" to one approval (decision-log 2026-10-23). */
export const SINGLE_APPROVAL_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN', 'DOCTOR_SERVICE'] as const;

interface HistoryEntry {
  action: string;
  authority: string;
  actorId: unknown;
  actorRole: string;
  comment: string | null;
  at: Date;
  resultingStatus: string;
  cycle: number;
}

interface WaitingRequest {
  cycle: number;
  history: HistoryEntry[];
}

/** The update for a request still at SUBMITTED on the old two-step workflow: only the workflow changes, so any approval now ends it. */
export function relaxWorkflow(request: { workflow: string }): { $set: { workflow: 'MANAGER_ONLY' } } | null {
  return request.workflow === 'MANAGER_THEN_FINAL' ? { $set: { workflow: 'MANAGER_ONLY' } } : null;
}

/**
 * The update that finalises a request that was waiting only on Admin: the manager's approval is the decision now. The entry
 * borrows the manager's actor so the history still names who approved; its authority says the rollout did it.
 */
export function finaliseWaiting(request: WaitingRequest, now: Date): { $set: Record<string, unknown>; $push: { history: HistoryEntry } } | null {
  const approval = [...request.history].reverse().find((h) => h.action === 'APPROVE' && h.cycle === request.cycle);
  if (!approval) return null;
  const entry: HistoryEntry = {
    action: 'APPROVE',
    authority: 'AUTO',
    actorId: approval.actorId,
    actorRole: approval.actorRole,
    comment: 'Single approval rollout: the manager approval is final',
    at: now,
    resultingStatus: 'APPROVED',
    cycle: request.cycle,
  };
  return { $set: { status: 'APPROVED', workflow: 'MANAGER_ONLY', decidedAt: now }, $push: { history: entry } };
}
