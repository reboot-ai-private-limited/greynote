import { apiGet } from './api';

/**
 * What a manager reads about their team beyond the approvals lists. Read-only, needs a connection (the phone keeps the last
 * copy of each list). A past financial year is selected through the `fy` option, like the other lists.
 */

/** One daily report of someone in the downline. `status` is the report's approval state, or `DRAFT` before it is sent. */
export type TeamDcr = {
  id: string;
  userId: string;
  reportDate: string;
  status: string;
  approval: { requestId: string; cycle: number; submittedAt: string; decidedAt: string | null } | null;
};

type Compliance = { submitted: number; approved: number };

/** One employee of the team over the range: how many working days had a plan and a daily report, TA/DA, and target against achievement. */
export type SalesDashboardRow = {
  employee: { id: string; name: string; employeeCode: string };
  designation: string | null;
  zone: string | null;
  routes: string[];
  workingDays: number;
  plan: Compliance;
  dcr: Compliance;
  taPaise: number;
  daPaise: number;
  /** `null` = no target set. */
  targetPaise: number | null;
  /** The secondary the employee entered, at PTR; `null` = nothing entered and no target. */
  achievedPaise: number | null;
  primaryPaise: number;
};

export type SalesDashboard = {
  /** The range actually read: `to` is held to today. */
  from: string;
  to: string;
  rows: SalesDashboardRow[];
  totals: { employees: number; taPaise: number; daPaise: number; targetPaise: number; achievedPaise: number; primaryPaise: number };
  total: number;
};

/** A manager's team (Admin: everyone) over a range of at most 93 days, one page of employees plus the totals. */
export const getSalesDashboard = (from: string, to: string, pageSize = 100) =>
  apiGet<SalesDashboard>(`/reports/sales-dashboard?from=${from}&to=${to}&pageSize=${pageSize}`, { auth: true, fy: true });

/** The downline's daily reports between two days (both inclusive), optionally for one person. */
export const listTeamDcrs = (from: string, to: string, userId?: string | null) =>
  apiGet<TeamDcr[]>(`/field-activity/dcr/team?from=${from}&to=${to}${userId ? `&userId=${userId}` : ''}`, { auth: true, fy: true });
