import { ApiError, apiGet, apiPost } from './api';
import type { NamedRoute } from './planning';

/**
 * The approval endpoints a manager uses (LLD approval.md): the inbox (what I can decide), the team list (my
 * downline — direct reports actionable, deeper levels read-only), one request with its history, and the decisions.
 * Everything needs a connection. Shapes follow packages/contracts approvals.ts.
 */
export type ApprovalStatus = 'SUBMITTED' | 'MANAGER_APPROVED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'REOPENED';

export type PersonRef = { id: string; employeeCode: string; name: string };

export type ApprovalAction = {
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'WITHDRAW' | 'RESUBMIT' | 'REOPEN';
  authority: string;
  actorRole: string;
  comment: string | null;
  at: string;
  resultingStatus: ApprovalStatus;
  cycle: number;
  actor: PersonRef | null;
};

export type ApprovalItem = {
  id: string;
  /** DAILY_PLAN, MONTHLY_PLAN, DCR, LEAVE, NEW_DOCTOR, DOCTOR_SERVICE, EXPENSE_MONTH. */
  kind: string;
  recordId: string;
  status: ApprovalStatus;
  workflow: 'MANAGER_THEN_FINAL' | 'MANAGER_ONLY';
  cycle: number;
  submittedAt: string;
  decidedAt: string | null;
  submitter: PersonRef | null;
  lastAction: ApprovalAction;
  /** The caller may approve or reject it right now. */
  canAct: boolean;
  dueAt: string | null;
  overdue: boolean;
};

export type ApprovalDetail = ApprovalItem & { history: ApprovalAction[]; canWithdraw: boolean; canReopen: boolean };

type Page<T> = { items: T[]; total: number };

export type TeamScope = 'direct' | 'indirect' | 'all';

export const KIND_LABEL: Record<string, string> = {
  DAILY_PLAN: 'Daily plan',
  MONTHLY_PLAN: 'Tour plan',
  DCR: 'Daily report',
  LEAVE: 'Leave',
  NEW_DOCTOR: 'New doctor',
  DOCTOR_SERVICE: 'Doctor service',
  EXPENSE_MONTH: 'Monthly expenses',
  SECONDARY_SALES: 'Secondary sales',
};

/** The request types a manager can filter by, in the order the chips show them. */
export const APPROVAL_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN', 'DCR', 'LEAVE', 'EXPENSE_MONTH', 'NEW_DOCTOR', 'DOCTOR_SERVICE', 'SECONDARY_SALES'] as const;
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  SUBMITTED: 'Waiting for the manager',
  MANAGER_APPROVED: 'Waiting for Admin',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

/**
 * What both lists can be narrowed by (the server's own parameters). `from` and `to` are instants with an offset; "overdue" is
 * not a server filter, so the screen applies it to what came back.
 */
export type ApprovalFilter = { kind?: string; status?: ApprovalStatus; submitterId?: string; from?: Date; to?: Date };

const filterQuery = (f: ApprovalFilter) =>
  [
    f.kind ? `&kind=${encodeURIComponent(f.kind)}` : '',
    f.status ? `&status=${f.status}` : '',
    f.submitterId ? `&submitterId=${f.submitterId}` : '',
    f.from ? `&from=${encodeURIComponent(f.from.toISOString())}` : '',
    f.to ? `&to=${encodeURIComponent(f.to.toISOString())}` : '',
  ].join('');

/** The year switch (lib/financial-year.ts) bounds both lists: a past year shows that year's requests. */
export const listInbox = (pageSize = 50, filter: ApprovalFilter = {}) =>
  apiGet<Page<ApprovalItem>>(`/approvals/inbox?pageSize=${pageSize}${filterQuery(filter)}`, { fy: true });

export const listTeam = (scope: TeamScope, pageSize = 50, filter: ApprovalFilter = {}) =>
  apiGet<Page<ApprovalItem>>(`/approvals/team?scope=${scope}&pageSize=${pageSize}${filterQuery(filter)}`, { fy: true });

/** My own submissions, newest first, in any status — also bounded by the year switch. */
export const listMine = (pageSize = 100) => apiGet<Page<ApprovalItem>>(`/approvals/mine?pageSize=${pageSize}`, { fy: true });

/** Pulls back a request of mine that is still waiting (`ApprovalDetail.canWithdraw`); the record becomes editable again. */
export const withdrawRequest = (id: string, comment?: string) =>
  apiPost<unknown>(`/approvals/${id}/withdraw`, comment?.trim() ? { comment: comment.trim() } : {}, { auth: true });

export const getApproval = (id: string) => apiGet<ApprovalDetail>(`/approvals/${id}`);

export const approveRequest = (item: { id: string; cycle: number }, comment?: string) =>
  apiPost<unknown>(`/approvals/${item.id}/approve`, { cycle: item.cycle, ...(comment?.trim() ? { comment: comment.trim() } : {}) }, { auth: true });

export const rejectRequest = (item: { id: string; cycle: number }, comment: string) =>
  apiPost<unknown>(`/approvals/${item.id}/reject`, { cycle: item.cycle, comment: comment.trim() }, { auth: true });

/** Past its cutoff a leave or an expense month can't be approved (only rejected) unless Admin allows it; the server's wording already says so, this makes it certain. */
export const LATE_APPROVAL_TEXT = 'This can’t be approved any more: its deadline has passed. Ask Admin to allow it, or reject it.';

export const isLateApproval = (status: number, message: string, code?: unknown) =>
  code === 'LEAVE_APPROVAL_LATE' || code === 'EXPENSE_APPROVAL_LATE' || (status === 409 && /already started|deadline to approve|no longer be approved/i.test(message));

export type BulkResult =
  | { requestId: string; ok: true; status: ApprovalStatus }
  | { requestId: string; ok: false; statusCode: number; message: string };

export const bulkDecide = (decision: 'APPROVE' | 'REJECT', items: { id: string; cycle: number }[], comment?: string) =>
  apiPost<{ results: BulkResult[] }>(
    '/approvals/bulk',
    { decision, requests: items.map((i) => ({ id: i.id, cycle: i.cycle })), ...(comment?.trim() ? { comment: comment.trim() } : {}) },
    { auth: true },
  );

/**
 * Whether the caller is a manager (anyone whose designation is above MR, with or without a team yet) — what decides if the Team
 * tab shows. The backend has no flag, so two signals are combined: any team request at all (inbox or team), or the planning
 * API's own answer. `GET /planning/daily/team-suggest` refuses a non-manager with `403` before it looks at anything else, and
 * refuses a manager's own id with `400` (not in their team), so asking about oneself tells the two apart. When the backend adds
 * a flag, this function is the one thing to swap.
 */
export async function probeHasTeam(userId: string): Promise<boolean> {
  const [inbox, team] = await Promise.all([
    apiGet<Page<ApprovalItem>>('/approvals/inbox?pageSize=1'),
    apiGet<Page<ApprovalItem>>('/approvals/team?scope=all&pageSize=1'),
  ]);
  if (inbox.total > 0 || team.total > 0) return true;
  try {
    // Only the answer's kind matters, so the date is just any valid one.
    await apiGet(`/planning/daily/team-suggest?date=${new Date().toISOString().slice(0, 10)}&userIds=${userId}`, { auth: true });
    return true;
  } catch (err) {
    if (err instanceof ApiError) return err.status !== 403;
    throw err;
  }
}

/* ───────────────────────── the record behind a request ───────────────────────── */

export type GeofenceOutcome = {
  status: 'PASS' | 'FAIL' | 'UNVERIFIED';
  distanceMeters: number | null;
  reason: string | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
  overrideComment: string | null;
};

/** packages/contracts fieldActivity.ts: the work type (the day's plan type) and route type are stamped by the server. */
type CallBase = {
  id: string;
  workingType: string;
  routeId?: string | null;
  routeType?: string | null;
  remarks: string | null;
  accuracyMeters: number | null;
  geofence: GeofenceOutcome;
  recordedAt: string;
  /** The call's route isn't one the day's plan lists. */
  routeNotInPlan?: boolean;
};
export type DcrDoctorCall = CallBase & {
  doctorId: string;
  doctorName: string;
  samples: { productName: string; quantity: number }[];
  /** The day's plan lists doctors and this one wasn't among them. */
  notInPlan?: boolean;
};
export type DcrChemistCall = CallBase & { chemistId: string; chemistName: string };
export type DcrFollowup = {
  id: string;
  subject: 'DOCTOR' | 'CHEMIST';
  subjectName: string;
  remarks: string;
  /** `null` on follow-ups from before the work type, route type and GPS were recorded. */
  workingType?: string | null;
  routeType?: string | null;
  notInPlan?: boolean;
};
export type DcrExpense = { id: string; type: string; source: 'AUTO' | 'MANUAL'; amountPaise: number; remarks: string | null; accepted: boolean };
export type DcrDetail = {
  id: string;
  reportDate: string;
  status: string;
  /** The employee's note on the day (required on a Meeting or Conference day). */
  remarks?: string | null;
  doctorCalls: DcrDoctorCall[];
  chemistCalls: DcrChemistCall[];
  followups: DcrFollowup[];
  expenses: DcrExpense[];
};
export const getDcr = (id: string) => apiGet<DcrDetail>(`/field-activity/dcr/${id}`);

/** Accepts a call the location check flagged. A separate act from approving the day; a reason is required. */
export const acceptCall = (dcrId: string, callId: string, comment: string) =>
  apiPost<unknown>(`/field-activity/dcr/${dcrId}/calls/${callId}/override-geofence`, { comment: comment.trim() }, { auth: true });

export type PlanDayView = { workingType: string; workWith: string[]; routeIds: string[]; remarks: string | null };
export type DailyPlanRecord = PlanDayView & {
  id: string;
  planDate: string;
  source: 'MANUAL' | 'MONTHLY';
  /** The doctors to call (`carriedFrom` = a missed call still owed). Absent from older servers. */
  doctors?: { doctorId: string; carriedFrom: string | null }[];
  /** The plan's routes named and typed. Absent from older servers. */
  routes?: NamedRoute[];
};
/** `routes`: every route the entries name, once each (absent from older servers). */
export type MonthlyPlanRecord = { id: string; planMonth: string; entries: (PlanDayView & { planDate: string })[]; routes?: NamedRoute[] };
export const getDailyPlanRecord = (id: string) => apiGet<DailyPlanRecord>(`/planning/daily/${id}`);
export const getMonthlyPlanRecord = (id: string) => apiGet<MonthlyPlanRecord>(`/planning/monthly/${id}`);

export type LeaveRecord = {
  id: string;
  leaveTypeName: string;
  isPaid: boolean;
  startDate: string;
  endDate: string;
  reason: string | null;
  daysCount: number;
  status?: ApprovalStatus;
  attachments: { id: string; url: string; fileName: string; sizeBytes: number }[];
};
export const getLeaveRecord = (id: string) => apiGet<LeaveRecord>(`/hr/leaves/${id}`);

export type DoctorRecord = {
  id: string;
  routeId: string;
  name: string;
  address: string;
  email: string | null;
  clinicName?: string | null;
  phone?: string | null;
  specialty: string;
  qualification: string;
  visitFrequency?: number | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  /** Where the doctor is registered — the approver may have corrected it — and where the phone was when it was added. */
  location: { latitude: number; longitude: number } | null;
  capturedLocation: { latitude: number; longitude: number } | null;
  status: string;
};
export const getDoctorRecord = (id: string) => apiGet<DoctorRecord>(`/field-master-data/doctors/${id}`);

export type DoctorServiceRecord = {
  id: string;
  doctorName: string;
  serviceType: string;
  amountPaise: number;
  remarks: string | null;
};
export const getDoctorServiceRecord = (id: string) => apiGet<DoctorServiceRecord>(`/field-activity/doctor-services/${id}`);
