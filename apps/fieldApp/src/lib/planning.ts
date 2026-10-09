import type { PlanStatus } from '@/types/sync';

import { apiGet, apiPost } from './api';

/**
 * The Planning endpoints (LLD/planning.md). Saving and submitting a Plan need a live connection —
 * the one documented exception to the offline queue, because the day's gate reads the live
 * approval status (HLD 10). Callers check `isOnline()` first and say so, rather than queueing.
 */

export type WorkingType = 'FIELD_WORK' | 'MEETING' | 'CONFERENCE' | 'STRIKE';

export const WORKING_TYPES: { value: WorkingType; label: string }[] = [
  { value: 'FIELD_WORK', label: 'Field Work' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'STRIKE', label: 'Strike' },
];

/** A single call is never a Strike (that is a whole-day type, with no TA/DA), so the call forms offer the other three. */
export const CALL_WORKING_TYPES = WORKING_TYPES.filter((w) => w.value !== 'STRIKE');

export const workingTypeLabel = (t: WorkingType) => WORKING_TYPES.find((w) => w.value === t)?.label ?? t;

/** One planned day: what a Daily Plan holds, and what each Monthly Plan entry holds. */
export type PlanDay = {
  workingType: WorkingType;
  /** Colleagues worked with. Always sent empty for now — no endpoint lists them for an MR yet. */
  workWith: string[];
  routeIds: string[];
  remarks: string | null;
};

export const EMPTY_DAY: PlanDay = { workingType: 'FIELD_WORK', workWith: [], routeIds: [], remarks: null };

type StateView = {
  id: string;
  status: PlanStatus;
  approval: { requestId: string } | null;
  submitDeadline: string;
  resubmitAllowedUntil: string | null;
  lateSubmitAllowedUntil: string | null;
};

export type DailyPlanView = PlanDay & StateView & { planDate: string };
export type MonthlyPlanView = StateView & { planMonth: string; entries: (PlanDay & { planDate: string })[] };

/** Statuses in which the owner may still change the Plan (no request yet, or sent back to them). */
export const EDITABLE: (PlanStatus | null)[] = [null, 'DRAFT', 'REJECTED', 'WITHDRAWN', 'REOPENED'];

export const saveDailyPlan = (planDate: string, day: PlanDay) =>
  apiPost<DailyPlanView>('/planning/daily', { planDate, ...day }, { auth: true });

export const submitDailyPlan = (id: string) =>
  apiPost<DailyPlanView>(`/planning/daily/${id}/submit`, {}, { auth: true });

export const requestDailyPlanChange = (id: string, day: PlanDay, reason: string) =>
  apiPost<unknown>(`/planning/daily/${id}/changes`, { ...day, reason }, { auth: true });

export const saveMonthlyPlan = (planMonth: string, entries: (PlanDay & { planDate: string })[]) =>
  apiPost<MonthlyPlanView>('/planning/monthly', { planMonth, entries }, { auth: true });

export const submitMonthlyPlan = (id: string) =>
  apiPost<MonthlyPlanView>(`/planning/monthly/${id}/submit`, {}, { auth: true });

export const withdrawPlan = (requestId: string) =>
  apiPost<unknown>(`/approvals/${requestId}/withdraw`, {}, { auth: true });

/** The manager's reason for the latest rejection, or null if there isn't one to show. */
export async function getRejectionReason(requestId: string): Promise<string | null> {
  const detail = await apiGet<{ history?: HistoryEntry[]; request?: { history?: HistoryEntry[] } }>(
    `/approvals/${requestId}`,
  );
  const history = detail.history ?? detail.request?.history ?? [];
  const rejection = [...history].reverse().find((h) => h.action === 'REJECT');
  return rejection?.comment ?? null;
}

type HistoryEntry = { action: string; comment: string | null };

/* ───────────── the full plan views (everything the server knows about a plan) ───────────── */

/** A change a manager or Admin made to a day, with what it replaced. `by` is a user id, not a name. */
export type PlanAmendment = { by: string; at: string; reason: string; previous: PlanDay };

/**
 * What `GET /planning/daily` and `/monthly` return beyond the synced snapshot: where a day came from,
 * the manager's amendments, and the two windows that let a late submit through. Fetched online only.
 */
export type DailyPlanDetail = DailyPlanView & {
  /** `MONTHLY` = inherited from an approved Monthly Plan (read-only, submit as it is); `MANUAL` = written by the MR. */
  source: 'MONTHLY' | 'MANUAL';
  amendments: PlanAmendment[];
};

export type MonthlyPlanDetail = MonthlyPlanView;

export async function getDailyPlanDetail(planDate: string): Promise<DailyPlanDetail | null> {
  const rows = await apiGet<DailyPlanDetail[]>(`/planning/daily?from=${planDate}&to=${planDate}`, { auth: true });
  return rows.find((r) => r.planDate === planDate) ?? null;
}

export async function getMonthlyPlanDetail(planMonth: string): Promise<MonthlyPlanDetail | null> {
  const rows = await apiGet<MonthlyPlanDetail[]>(`/planning/monthly?from=${planMonth}&to=${planMonth}`, { auth: true });
  return rows.find((r) => r.planMonth === planMonth) ?? null;
}

/** An in-day change request and where it is in the manager's approval. */
export type DailyPlanChange = {
  id: string;
  planId: string;
  planDate: string;
  previous: PlanDay;
  proposed: PlanDay;
  reason: string;
  /** The approval request's status: SUBMITTED, APPROVED, REJECTED or WITHDRAWN. */
  status: string;
  /** Waiting for a decision. */
  open: boolean;
  /** Approved and written into the plan. */
  applied: boolean;
  createdAt: string;
  approval: { requestId: string; decidedAt: string | null } | null;
};

/** Newest first. */
export const listDailyPlanChanges = (planId: string) =>
  apiGet<DailyPlanChange[]>(`/planning/daily/${planId}/changes`, { auth: true });
