import { apiGet, apiPost } from './api';

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
  /** DAILY_PLAN, MONTHLY_PLAN, DAILY_PLAN_CHANGE, DCR, LEAVE, NEW_DOCTOR, DOCTOR_SERVICE. */
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
  MONTHLY_PLAN: 'Monthly plan',
  DAILY_PLAN_CHANGE: 'Plan change',
  DCR: 'Daily report',
  LEAVE: 'Leave',
  NEW_DOCTOR: 'New doctor',
  DOCTOR_SERVICE: 'Doctor service',
};
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  SUBMITTED: 'Waiting for the manager',
  MANAGER_APPROVED: 'Waiting for Admin',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

export const listInbox = (pageSize = 50) => apiGet<Page<ApprovalItem>>(`/approvals/inbox?pageSize=${pageSize}`);

export const listTeam = (scope: TeamScope, pageSize = 50) =>
  apiGet<Page<ApprovalItem>>(`/approvals/team?scope=${scope}&pageSize=${pageSize}`);

export const getApproval = (id: string) => apiGet<ApprovalDetail>(`/approvals/${id}`);

export const approveRequest = (item: { id: string; cycle: number }, comment?: string) =>
  apiPost<unknown>(`/approvals/${item.id}/approve`, { cycle: item.cycle, ...(comment?.trim() ? { comment: comment.trim() } : {}) }, { auth: true });

export const rejectRequest = (item: { id: string; cycle: number }, comment: string) =>
  apiPost<unknown>(`/approvals/${item.id}/reject`, { cycle: item.cycle, comment: comment.trim() }, { auth: true });

export type BulkResult =
  | { requestId: string; ok: true; status: ApprovalStatus }
  | { requestId: string; ok: false; statusCode: number; message: string };

export const bulkDecide = (decision: 'APPROVE' | 'REJECT', items: { id: string; cycle: number }[], comment?: string) =>
  apiPost<{ results: BulkResult[] }>(
    '/approvals/bulk',
    { decision, requests: items.map((i) => ({ id: i.id, cycle: i.cycle })), ...(comment?.trim() ? { comment: comment.trim() } : {}) },
    { auth: true },
  );

/** Whether the caller has any team request at all — what decides if the Team tab shows (no backend flag exists). */
export async function probeHasTeam(): Promise<boolean> {
  const [inbox, team] = await Promise.all([
    apiGet<Page<ApprovalItem>>('/approvals/inbox?pageSize=1'),
    apiGet<Page<ApprovalItem>>('/approvals/team?scope=all&pageSize=1'),
  ]);
  return inbox.total > 0 || team.total > 0;
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

type CallBase = {
  id: string;
  workingType: string;
  remarks: string | null;
  accuracyMeters: number | null;
  geofence: GeofenceOutcome;
  recordedAt: string;
};
export type DcrDoctorCall = CallBase & { doctorId: string; doctorName: string; samples: { productName: string; quantity: number }[] };
export type DcrChemistCall = CallBase & { chemistId: string; chemistName: string };
export type DcrFollowup = { id: string; subject: 'DOCTOR' | 'CHEMIST'; subjectName: string; remarks: string };
export type DcrExpense = { id: string; type: string; source: 'AUTO' | 'MANUAL'; amountPaise: number; remarks: string | null; accepted: boolean };
export type DcrDetail = {
  id: string;
  reportDate: string;
  status: string;
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
export type DailyPlanRecord = PlanDayView & { id: string; planDate: string; source: 'MANUAL' | 'MONTHLY' };
export type MonthlyPlanRecord = { id: string; planMonth: string; entries: (PlanDayView & { planDate: string })[] };
export type PlanChangeRecord = { id: string; planDate: string; previous: PlanDayView; proposed: PlanDayView; reason: string };
export const getDailyPlanRecord = (id: string) => apiGet<DailyPlanRecord>(`/planning/daily/${id}`);
export const getMonthlyPlanRecord = (id: string) => apiGet<MonthlyPlanRecord>(`/planning/monthly/${id}`);
export const getPlanChangeRecord = (id: string) => apiGet<PlanChangeRecord>(`/planning/changes/${id}`);

export type LeaveRecord = {
  id: string;
  leaveTypeName: string;
  isPaid: boolean;
  startDate: string;
  endDate: string;
  reason: string | null;
  daysCount: number;
  attachments: { id: string; url: string; fileName: string; sizeBytes: number }[];
};
export const getLeaveRecord = (id: string) => apiGet<LeaveRecord>(`/hr/leaves/${id}`);

export type DoctorRecord = {
  id: string;
  routeId: string;
  name: string;
  address: string;
  email: string | null;
  specialty: string;
  qualification: string;
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
