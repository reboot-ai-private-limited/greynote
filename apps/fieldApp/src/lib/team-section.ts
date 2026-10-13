import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useOnline } from '@/offline';

import { apiGet } from './api';

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

/* ── today ── */

export type DayState = 'REPORTED' | 'WORKING' | 'NOT_YET' | 'NOT_STARTED' | 'MISSED' | 'ON_LEAVE' | 'OFF';

export type TeamDayRow = {
  user: TeamUser;
  state: DayState;
  plan: { status: string; workingType: string; routeCount: number; doctorCount: number } | null;
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

export const getTeamToday = (p: { date?: string; scope?: TeamScopeFilter; state?: DayState; attention?: boolean; page?: number } = {}) =>
  apiGet<TeamToday>(`/team/today${query({ pageSize: 100, ...p })}`, { auth: true, fy: true });

/* ── plans ── */

export type TeamPlanRow = {
  user: TeamUser;
  dailyPlan: { status: string; workingType: string; routeCount: number; doctorCount: number } | null;
  monthlyPlanStatus: string | null;
};

export type TeamPlans = Paged<TeamPlanRow> & { date: string; month: string; counts: Record<string, number> };

export const getTeamPlans = (p: { date?: string; scope?: TeamScopeFilter; planStatus?: string; page?: number } = {}) =>
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
export const getTeamLeaves = (p: { from: string; to: string; scope?: TeamScopeFilter; status?: TeamLeave['status'] }) =>
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

export const getTeamOrders = (p: { from: string; to: string; scope?: TeamScopeFilter; status?: TeamOrderRow['status']; outletType?: 'CHEMIST' | 'DISTRIBUTOR'; page?: number }) =>
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

export const getTeamStock = (p: { month: string; scope?: TeamScopeFilter; missingStock?: boolean; secondary?: SecondaryState; page?: number }) =>
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

export const getTeamOverview = (p: { month: string; scope?: TeamScopeFilter; search?: string; page?: number }) =>
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
