import type { PlanStatus } from '@/types/sync';

import { ApiError, NetworkError, apiGet, apiPatch, apiPost } from './api';

/**
 * The Planning endpoints (LLD/planning.md). Saving and submitting a Plan need a live connection —
 * the one documented exception to the offline queue, because the day's gate reads the live
 * approval status (HLD 10). Callers check `isOnline()` first and say so, rather than queueing.
 */

export type WorkingType = 'FIELD_WORK' | 'DOCTOR_CAMPAIGN' | 'MEETING' | 'CONFERENCE' | 'STRIKE';

export const WORKING_TYPES: { value: WorkingType; label: string }[] = [
  { value: 'FIELD_WORK', label: 'Field Work' },
  { value: 'DOCTOR_CAMPAIGN', label: 'Doctor Campaign' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'STRIKE', label: 'Strike' },
];

/**
 * The days that go to doctors and chemists (packages/contracts `isFieldDay`): they have routes, doctors and calls.
 * A campaign pays DA at the highest route type and no TA. Meeting, Conference and Strike days have no calls at all.
 */
export const isFieldDay = (t: WorkingType | string | null | undefined): boolean => t === 'FIELD_WORK' || t === 'DOCTOR_CAMPAIGN';

/** On a Meeting or Conference day the daily report needs a note (agenda, venue); on a Strike day it is optional. */
export const needsDayNote = (t: WorkingType | string | null | undefined): boolean => t === 'MEETING' || t === 'CONFERENCE';

export const workingTypeLabel = (t: WorkingType | string) => WORKING_TYPES.find((w) => w.value === t)?.label ?? t;

/** The kind of route a record was made on, as the server stamps it. */
export type RouteType = 'HQ' | 'EX_STATION' | 'OUT_STATION';
const ROUTE_TYPE_LABEL: Record<RouteType, string> = { HQ: 'HQ', EX_STATION: 'Ex-station', OUT_STATION: 'Out-station' };
export const routeTypeLabel = (t: string | null | undefined) => (t ? (ROUTE_TYPE_LABEL[t as RouteType] ?? t) : null);

/**
 * `STAY` / `TRANSIT`: a day of an out-station trip the server wrote from the first day's `returnDate` (docs/mobile/monthlyplan.md
 * rule 16). A stay day earns out-station DA only; a transit (return) day earns TA and ex-station DA. They are normal working days.
 */
export type DayKind = 'NORMAL' | 'STAY' | 'TRANSIT';
export const isTripDay = (kind: DayKind | undefined) => kind === 'STAY' || kind === 'TRANSIT';

/** One planned day: what a Daily Plan holds, and what each Monthly Plan entry holds. */
export type PlanDay = {
  workingType: WorkingType;
  /** Colleagues worked with (ids from `GET /identity/work-with`), at most 20. */
  workWith: string[];
  routeIds: string[];
  remarks: string | null;
  /** On a trip's first day: the day the employee comes back (after this day, this month or the next). Empty for a same-day return. */
  returnDate?: string | null;
  /** Read back from the server; the phone never sends it (the server rebuilds the stay/transit days from `returnDate`). */
  dayKind?: DayKind;
};

export const EMPTY_DAY: PlanDay = { workingType: 'FIELD_WORK', workWith: [], routeIds: [], remarks: null };

type StateView = {
  id: string;
  status: PlanStatus;
  /** Who/when: the approval request the plan sits in (`decidedAt` null while waiting). */
  approval: { requestId: string; cycle?: number; submittedAt?: string; decidedAt?: string | null } | null;
  submitDeadline: string;
  resubmitAllowedUntil: string | null;
  lateSubmitAllowedUntil: string | null;
};

/** A doctor on a day's plan. `carriedFrom` = the day first planned, set when it is a missed call still owed (those cannot be dropped). */
export type PlannedDoctor = { doctorId: string; carriedFrom: string | null };

export type DailyPlanView = PlanDay & StateView & { planDate: string; doctors?: PlannedDoctor[] };
export type MonthlyPlanView = StateView & { planMonth: string; entries: (PlanDay & { planDate: string })[] };

/** Statuses in which the owner may still change the Plan (no request yet, or sent back to them). */
export const EDITABLE: (PlanStatus | null)[] = [null, 'DRAFT', 'REJECTED', 'WITHDRAWN', 'REOPENED'];

/*
 * A Daily Plan starts from the approved Monthly Plan (docs/mobile/dailyplan.md). While it is editable the employee can change
 * its working type, work with and doctors (`saveDailyPlan`); the routes and remarks stay the Monthly Plan's and the server sets
 * the routes. Changes to an approved day are made by the manager or Admin (amend), never requested in the app.
 */

/**
 * Changes the day's working type, work with and doctors together (POST /planning/daily/plan). Routes and remarks are not sent:
 * the server sets the routes (the Monthly Plan's, or for a manager those of the people named) and returns the whole plan.
 * `doctorIds` is at most 50 for an MR and 100 for a manager.
 */
export const saveDailyPlan = (planDate: string, day: { workingType: WorkingType; workWith: string[]; doctorIds: string[] }) =>
  apiPost<DailyPlanDetail>('/planning/daily/plan', { planDate, ...day }, { auth: true });

/** One team member's routes and doctors for a date: from their Daily Plan, else their Monthly Plan, else nothing. */
export type TeamSuggestPerson = {
  userId: string;
  name: string;
  source: 'DAILY_PLAN' | 'MONTHLY_PLAN' | 'NONE';
  planStatus?: PlanStatus | null;
  routeIds: string[];
  doctorIds: string[];
};
export type TeamSuggestion = { planDate: string; people: TeamSuggestPerson[]; routeIds: string[]; doctorIds: string[] };

/** Manager only: the routes and doctors of the people they would work with (at most 20, all in their downline). */
export const getTeamSuggest = (date: string, userIds: string[]) =>
  apiGet<TeamSuggestion>(`/planning/daily/team-suggest?date=${date}&userIds=${userIds.join(',')}`, { auth: true });

export const submitDailyPlan = (id: string) =>
  apiPost<DailyPlanView>(`/planning/daily/${id}/submit`, {}, { auth: true });

/**
 * Sets the doctors to call on a Field Work or Doctor Campaign day (at most 50). The server adds the missed calls still owed and
 * refuses (400 on `doctorIds`) a doctor that isn't assigned to the employee or isn't on one of the day's routes.
 */
export const setDailyPlanDoctors = (planDate: string, doctorIds: string[]) =>
  apiPost<DailyPlanView>('/planning/daily/doctors', { planDate, doctorIds }, { auth: true });

/** Doctors planned on earlier days and not called since — owed on `date`, oldest first. */
export const getCarryOver = (date: string) =>
  apiGet<PlannedDoctor[]>(`/planning/daily/carry-over?date=${date}`, { auth: true });

/**
 * A manager or Admin changes an employee's plan for a day, with a reason; the old day is kept on the plan and the employee
 * sees it was changed. The plan's approval is untouched. Refused once the day is over or its report is submitted.
 */
export const amendDailyPlan = (planId: string, day: PlanDay, reason: string) =>
  apiPatch<DailyPlanView>(`/planning/daily/${planId}/amend`, { ...day, reason: reason.trim() });

/**
 * Saves the whole month as a draft. A trip's stay and transit days are left out: the server writes them again from the first
 * day's `returnDate` (and from a trip into the next month), so sending them would only get in its way.
 */
export const saveMonthlyPlan = (planMonth: string, entries: (PlanDay & { planDate: string })[]) =>
  apiPost<MonthlyPlanView>(
    '/planning/monthly',
    {
      planMonth,
      entries: entries
        .filter((e) => !isTripDay(e.dayKind))
        .map(({ dayKind: _kind, returnDate, ...rest }) => ({ ...rest, ...(returnDate ? { returnDate } : {}) })),
    },
    { auth: true },
  );

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
  /** `MONTHLY` = the day is as the Monthly Plan wrote it; `MANUAL` = the employee changed it (not overwritten when the month is approved again). */
  source: 'MONTHLY' | 'MANUAL';
  amendments: PlanAmendment[];
  /** True once the employee changed the day the Monthly Plan wrote; `plannedFrom` is what the Monthly Plan said (doctors are not part of it). */
  changedFromMonthly?: boolean;
  plannedFrom?: PlanDay | null;
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

/** The deadline message the docs ask for when a submit is refused as late (`409 PLAN_SUBMIT_LATE`) or the deadline has passed. */
export const LATE_TEXT = 'The deadline has passed. Ask Admin for a late-submission exception.';
/** A blocked employee (a missed daily report) can't submit or log anything (`403`, `userBlocked`). */
export const BLOCKED_TEXT = 'You’re blocked for a missed daily report. Ask your manager or Admin to unblock you.';

/** A plan save or submit failure as the employee should read it: the docs' wording for blocked and late, else the server's message. */
export function planErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return BLOCKED_TEXT;
    if (err.status === 409 && /late|deadline/i.test(err.message)) return LATE_TEXT;
    return err.message;
  }
  return err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';
}
