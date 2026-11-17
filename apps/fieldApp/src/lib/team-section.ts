import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Accent } from '@/constants/theme';
import { useOnline } from '@/offline';

import { apiGet } from './api';
import type { NamedRoute } from './planning';

/**
 * The manager's Team section (docs/mobile/team.md). Every route covers only the caller's downline; a person outside it is a 403.
 * Lists page with `page` / `pageSize` and answer `{ items, page, pageSize, total, totalPages }` unless noted. Money is whole paise.
 * Reads follow the financial year in view (`fy: true`) except the approvals badge, which is current work.
 */
export type TeamScopeFilter = 'all' | 'direct' | 'indirect';

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

export type TeamUser = { id: string; employeeCode: string; name: string; depth?: number };

const query = (params: Record<string, string | number | boolean | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

/* ── the approvals badge ── */

export type ApprovalSummary = { total: number; overdue: number; byKind: { kind: string; count: number; overdue: number }[] };

/** What waits on me (a manager: direct reports at stage 1). Current work, so no financial-year header. */
export const getApprovalSummary = () => apiGet<ApprovalSummary>('/approvals/inbox/summary', { auth: true });

/** The badge numbers, read when the screen is shown, when the app comes to the front and when the connection returns (no push yet). */
export function useApprovalSummary() {
  const online = useOnline();
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    getApprovalSummary()
      .then((s) => alive && setSummary(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [online, tick]);

  return { summary, refresh };
}

/* ── roster ── */

export type TeamMember = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  status: 'active' | 'pending' | 'inactive';
  depth: number;
  isManager: boolean;
  managerId: string | null;
  hq: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
};

export const listTeamMembers = (p: { scope?: TeamScopeFilter; search?: string; page?: number; pageSize?: number } = {}) =>
  apiGet<Paged<TeamMember>>(`/team/members${query({ status: 'active', pageSize: 100, ...p })}`, { auth: true, fy: true });

/** The whole roster, however many pages. */
export const listAllTeamMembers = () => allPages((page) => listTeamMembers({ page }));

/* ── today ── */

export type DayState = 'REPORTED' | 'WORKING' | 'NOT_YET' | 'NOT_STARTED' | 'MISSED' | 'ON_LEAVE' | 'OFF';

export type TeamDayRow = {
  user: TeamUser;
  state: DayState;
  /** `routes`: the day's routes named and typed (missing from an older server). */
  plan: { status: string; workingType: string; routeCount: number; routes?: NamedRoute[]; doctorCount: number } | null;
  dcr: { status: string; doctorCalls: number; chemistCalls: number; followups: number } | null;
  leave: { leaveId: string; leaveType: string | null; status: string; startDate: string; endDate: string } | null;
  blocked: boolean;
  attention: boolean;
};

export type TeamToday = Paged<TeamDayRow> & {
  date: string;
  notStartedAfter: string;
  tiles: { total: number; blocked: number; noPlan: number; attention: number } & Partial<Record<DayState, number>>;
};

export const getTeamToday = (p: { date?: string; scope?: TeamScopeFilter; userId?: string; state?: DayState; attention?: boolean; page?: number } = {}) =>
  apiGet<TeamToday>(`/team/today${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });

/** Every page of a list the server cuts at 100, so a big team (a ZSM's) is counted whole. Stops at 20 pages. */
async function allPages<T, P extends Paged<T>>(read: (page: number) => Promise<P>): Promise<P> {
  const first = await read(1);
  const items = [...first.items];
  for (let page = 2; page <= Math.min(first.totalPages, 20); page++) items.push(...(await read(page)).items);
  return { ...first, items };
}

export const getAllTeamToday = (p: { date?: string; scope?: TeamScopeFilter } = {}) => allPages((page) => getTeamToday({ ...p, page }));

/* ── the board for a day, and one person's month ── */

export type DoctorLine = { id: string; name: string; visited: boolean; visitedAt: string | null; remarks: string | null; geofence: string | null };
export type PlanPerson = { id: string; name: string; designation: string | null; label: string };

/** One person on a day: where they go, which doctors by name and which were called, what else they did, where the report stands. */
export type BoardRow = {
  user: TeamUser;
  plan: { status: string; workingType: string; routes: NamedRoute[]; workWith: PlanPerson[]; remarks: string | null; fromTourPlan?: boolean; deadlinePassed?: boolean } | null;
  doctors: { planned: DoctorLine[]; alsoVisited: DoctorLine[] };
  chemistCalls: number;
  followups: number;
  orders: { count: number; amountPaise: number };
  report: { status: string } | null;
  onLeave: boolean;
  summary: { planned: number; visited: number; missed: number };
};
export type TeamBoard = Paged<BoardRow> & {
  date: string;
  past: boolean;
  totals: { people: number; plannedDoctors: number; visitedDoctors: number; plansWaiting?: number; planNotApproved: number; reportsIn: number; onLeave: number };
};
export type DayFilter = 'PLAN_NOT_APPROVED' | 'NO_CALLS' | 'REPORT_NOT_SENT';

export const getTeamDay = (p: { date: string; scope?: TeamScopeFilter; userId?: string; filter?: DayFilter; page?: number }) =>
  apiGet<TeamBoard>(`/team/day${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });
export const getAllTeamDay = (p: { date: string; scope?: TeamScopeFilter; filter?: DayFilter }) => allPages((page) => getTeamDay({ ...p, page }));

export type TeamMemberDay = {
  date: string;
  plan: { status: string; workingType: string; routes: NamedRoute[]; workWith: PlanPerson[]; remarks: string | null; changedFromMonthly: boolean } | null;
  doctors: { planned: DoctorLine[]; alsoVisited: DoctorLine[] };
  report: { status: string; doctorCalls: number; chemistCalls: number; followups: number } | null;
  summary: { planned: number; visited: number; missed: number };
};
export type TeamMemberDays = { month: string; monthlyPlanStatus: string | null; items: TeamMemberDay[] };
export const getTeamMemberDays = (userId: string, month: string) => apiGet<TeamMemberDays>(`/team/members/${userId}/days${query({ month })}`, { auth: true, fy: true });

/* ── one person's attendance, doctors; one doctor ── */

export type AttendanceStatus = 'NOT_YET' | 'BEFORE_JOINING' | 'NOT_EMPLOYED' | 'HOLIDAY' | 'WEEKLY_OFF' | 'LEAVE' | 'STRIKE' | 'PRESENT' | 'ABSENT' | 'UNKNOWN';
export type AttendanceMonth = { userId: string; month: string; days: { date: string; status: AttendanceStatus }[]; counts: Record<string, number> };
export const getMemberAttendance = (userId: string, month: string) => apiGet<AttendanceMonth>(`/team/members/${userId}/attendance${query({ month })}`, { auth: true, fy: true });

export type ServiceTotals = { count: number; totalPaise: number; waiting: number; toDo: number; done: number; rejected: number };
export type MemberDoctor = {
  id: string;
  name: string;
  specialty: string;
  clinicName: string | null;
  routeName: string | null;
  visitFrequency: number | null;
  /** The MR who holds the doctor (on a manager's page, whose team's doctor it is). Absent from older servers. */
  heldBy?: { id: string; name: string };
  visitsThisMonth: number;
  lastVisit: string | null;
  services: ServiceTotals;
};
export const getMemberDoctors = (userId: string, month: string) => apiGet<{ month: string; items: MemberDoctor[] }>(`/team/members/${userId}/doctors${query({ month })}`, { auth: true, fy: true });

export type TeamDoctorDetail = {
  doctor: { id: string; name: string; specialty: string; clinicName: string | null; phone: string | null; address: string; visitFrequency: number | null; routeName: string | null };
  heldBy: { id: string; name: string; employeeCode: string };
  month: string;
  visitsThisMonth: number;
  calls: { date: string; at: string; remarks: string | null; geofence: string }[];
  services: { totals: ServiceTotals; items: { id: string; serviceType: string; amountPaise: number; remarks: string | null; status: string; doneAt: string | null; askedBy: string; createdAt: string }[] };
};
export const getTeamDoctor = (doctorId: string, month: string) => apiGet<TeamDoctorDetail>(`/team/doctors/${doctorId}${query({ month })}`, { auth: true, fy: true });

/** A service's stage in words, from its approval status and whether it was carried out. */
export const serviceStageText = (status: string, doneAt: string | null): { text: string; accent: Accent } =>
  doneAt ? { text: 'Done', accent: 'green' } : status === 'REJECTED' ? { text: 'Rejected', accent: 'red' } : status === 'APPROVED' || status === 'MANAGER_APPROVED' ? { text: 'Approved, to do', accent: 'blue' } : status === 'SUBMITTED' ? { text: 'Waiting for approval', accent: 'amber' } : { text: status.toLowerCase(), accent: 'slate' };

/** The plan chip's words and colour, from a Daily Plan status (`null` = no plan). */
export const PLAN_CHIP: Record<string, { text: string; accent: Accent }> = {
  APPROVED: { text: 'Plan approved', accent: 'green' },
  MANAGER_APPROVED: { text: 'Plan approved', accent: 'green' },
  SUBMITTED: { text: 'Plan waiting', accent: 'amber' },
  DRAFT: { text: 'Plan not sent', accent: 'red' },
  REJECTED: { text: 'Plan sent back', accent: 'red' },
  WITHDRAWN: { text: 'Plan withdrawn', accent: 'red' },
  REOPENED: { text: 'Plan reopened', accent: 'amber' },
};
/**
 * The Daily plan chip. A draft is only what the Tour Plan wrote, so it has no status: `null` (the card shows the route as "Tour Plan"); after the day's
 * submit time it reads "Daily plan not submitted". `null` plan = no daily plan at all.
 */
export function dailyPlanChip(plan: { status: string; deadlinePassed?: boolean } | null | undefined): { text: string; accent: Accent } | null {
  if (!plan) return null;
  if (plan.status === 'DRAFT') return plan.deadlinePassed ? { text: 'Daily plan not submitted', accent: 'red' } : null;
  const known = DAILY_CHIP[plan.status];
  return known ?? { text: `Daily plan ${plan.status.toLowerCase()}`, accent: 'slate' };
}
const DAILY_CHIP: Record<string, { text: string; accent: Accent }> = {
  APPROVED: { text: 'Daily plan approved', accent: 'green' },
  MANAGER_APPROVED: { text: 'Daily plan approved', accent: 'green' },
  SUBMITTED: { text: 'Daily plan waiting', accent: 'amber' },
  REJECTED: { text: 'Daily plan sent back', accent: 'red' },
  WITHDRAWN: { text: 'Daily plan withdrawn', accent: 'red' },
  REOPENED: { text: 'Daily plan reopened', accent: 'amber' },
};
/** A Tour Plan (the month) chip. */
export const tourPlanChip = (status: string | null | undefined): { text: string; accent: Accent } =>
  !status ? { text: 'Tour Plan not sent', accent: 'slate' } : status === 'APPROVED' || status === 'MANAGER_APPROVED' ? { text: 'Tour Plan approved', accent: 'green' } : status === 'SUBMITTED' ? { text: 'Tour Plan waiting', accent: 'amber' } : status === 'DRAFT' ? { text: 'Tour Plan not sent', accent: 'slate' } : { text: `Tour Plan ${status.toLowerCase()}`, accent: 'red' };

export const planChip = (status: string | null | undefined) => (status ? (PLAN_CHIP[status] ?? { text: status, accent: 'slate' as const }) : { text: 'No plan', accent: 'slate' as const });

/** The report chip's words and colour. A report is approved on its own, so APPROVED reads "Auto-approved" when nobody decided it. */
export const REPORT_CHIP: Record<string, { text: string; accent: Accent }> = {
  APPROVED: { text: 'Report approved', accent: 'green' },
  MANAGER_APPROVED: { text: 'Report approved', accent: 'green' },
  SUBMITTED: { text: 'Report sent', accent: 'blue' },
  DRAFT: { text: 'Report not sent', accent: 'amber' },
  REJECTED: { text: 'Report sent back', accent: 'red' },
};
export const reportChip = (status: string | null | undefined) => (status ? (REPORT_CHIP[status] ?? { text: status, accent: 'slate' as const }) : { text: 'No report', accent: 'slate' as const });

/* ── plans ── */

export type TeamPlanRow = {
  user: TeamUser;
  /** `changedFromMonthly`: the employee changed the day the Monthly Plan wrote (missing from an older server). */
  dailyPlan: { status: string; workingType: string; routeCount: number; routes?: NamedRoute[]; doctorCount: number; changedFromMonthly?: boolean } | null;
  monthlyPlanStatus: string | null;
};

export type TeamPlans = Paged<TeamPlanRow> & { date: string; month: string; counts: Record<string, number> };

export const getTeamPlans = (p: { date?: string; scope?: TeamScopeFilter; userId?: string; planStatus?: string; page?: number } = {}) =>
  apiGet<TeamPlans>(`/team/plans${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });

/* ── leave calendar ── */

export type TeamLeave = {
  leaveId: string;
  leaveType: string | null;
  startDate: string;
  endDate: string;
  half: 'FIRST' | 'SECOND' | null;
  daysCount: number;
  status: 'SUBMITTED' | 'MANAGER_APPROVED' | 'APPROVED';
  user: TeamUser;
};

/** A window of at most 93 days; not paged. */
export const getTeamLeaves = (p: { from: string; to: string; scope?: TeamScopeFilter; userId?: string; status?: TeamLeave['status'] }) =>
  apiGet<{ from: string; to: string; items: TeamLeave[] }>(`/team/leaves${query(p)}`, { auth: true, fy: true });

/* ── orders ── */

export type TeamOrderRow = {
  id: string;
  user: TeamUser;
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string; name: string };
  orderDate: string;
  status: 'PLACED' | 'DONE' | 'CANCELLED';
  totalAmountPaise: number;
  itemCount: number;
  remarks: string | null;
};

export type TeamOrders = Paged<TeamOrderRow> & {
  from: string;
  to: string;
  totals: { count: number; amountPaise: number; byStatus: Record<'PLACED' | 'DONE' | 'CANCELLED', { count: number; amountPaise: number }> };
  /** One person has more than 500 orders in the window, so the totals are short: narrow it. */
  truncated?: boolean;
};

export const getTeamOrders = (p: { from: string; to: string; scope?: TeamScopeFilter; userId?: string; status?: TeamOrderRow['status']; outletType?: 'CHEMIST' | 'DISTRIBUTOR'; page?: number }) =>
  apiGet<TeamOrders>(`/team/orders${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });

/* ── stock and secondary ── */

export type SecondaryState = 'NOT_ENTERED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type TeamStockRow = {
  user: TeamUser;
  missingOutlets: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string; name: string }[];
  secondary: SecondaryState;
  /** A direct report's sent month: decide it in Approvals (kind SECONDARY_SALES). */
  waitingOnYou: boolean;
};

export type TeamStock = Paged<TeamStockRow> & {
  month: string;
  tiles: { total: number; withMissingStock: number; secondary: Partial<Record<SecondaryState, number>> };
};

export const getTeamStock = (p: { month: string; scope?: TeamScopeFilter; userId?: string; missingStock?: boolean; secondary?: SecondaryState; page?: number }) =>
  apiGet<TeamStock>(`/team/stock${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });

/* ── overview report ── */

export type TeamOverviewRow = {
  employee: { id: string; name: string; employeeCode: string };
  designation: string | null;
  zone: string | { id: string; name: string } | null;
  routes: string[];
  workingDays: number;
  plan: { submitted: number; approved: number };
  dcr: { submitted: number; approved: number };
  taPaise: number;
  daPaise: number;
  targetPaise: number;
  /** `null` = no target set or nothing entered. */
  achievedPaise: number | null;
  primaryPaise: number;
  field: {
    reportedDays: number;
    lateDays: number;
    doctorCalls: number;
    chemistCalls: number;
    followups: number;
    calls: number;
    /** `null` when the person has no reported day in the month. */
    callsPerDay: number | null;
    unconfirmed: number;
    notInPlan: number;
    offRouteCalls: number;
    geofence: { pass: number; fail: number; unverified: number; override: number };
  };
  attendance: { present: number; leave: number; absent: number; strike: number; off: number };
};

/** Unlike the other team lists, the overview names its list `rows`, not `items`. */
export type TeamOverview = Omit<Paged<TeamOverviewRow>, 'items'> & {
  rows: TeamOverviewRow[];
  from: string;
  to: string;
  totals: Record<string, number>;
};

export const getTeamOverview = (p: { month: string; scope?: TeamScopeFilter; userId?: string; search?: string; page?: number }) =>
  apiGet<TeamOverview>(`/reports/team/overview${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });

/* ── one person ── */

export type TeamMemberSummary = {
  member: TeamMember;
  date: string;
  today: TeamDayRow | null;
  month: string;
  /** Their Team Overview row for the month; `null` for someone who has left. */
  overview: TeamOverviewRow | null;
};

export const getTeamMemberSummary = (id: string, month?: string) =>
  apiGet<TeamMemberSummary>(`/team/members/${id}/summary${query({ month })}`, { auth: true, fy: true });

/* ── words and colours the screens share ── */

export const DAY_STATE_TEXT: Record<DayState, string> = {
  REPORTED: 'Reported',
  WORKING: 'Working',
  NOT_YET: 'Not started yet',
  NOT_STARTED: 'Not started',
  MISSED: 'Missed',
  ON_LEAVE: 'On leave',
  OFF: 'Off',
};

export const SECONDARY_STATE_TEXT: Record<SecondaryState, string> = {
  NOT_ENTERED: 'Not entered',
  DRAFT: 'Draft',
  PENDING: 'Waiting for you',
  APPROVED: 'Approved',
  REJECTED: 'Sent back',
};

/** A person outside the downline is a 403, never an empty list. */
export const NOT_IN_TEAM_TEXT = 'This person is not in your team.';
