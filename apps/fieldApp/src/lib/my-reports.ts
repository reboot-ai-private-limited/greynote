import { apiGet } from './api';

/**
 * The employee's own report reads (docs/mobile/reports.md rule 11). FIELD only, always the signed-in user, and bound to the
 * financial year in view: pass that year (and the `X-Financial-Year` header goes along with it).
 */

export type TaDaFigures = {
  taPaise: number;
  daPaise: number;
  reimbursementPaise: number;
  totalPaise: number;
  paidPaise: number;
  unpaidPaise: number;
  flaggedRows: number;
};
export type TaDaMonth = TaDaFigures & { month: string; state: 'ENDED' | 'OPEN' | 'FUTURE'; employees: number };
export type TaDaYear = { year: number; months: TaDaMonth[]; totals: TaDaFigures };

export type TaDaDay = {
  date: string;
  type: 'TA' | 'DA' | 'OTHER' | 'TRAVEL' | 'MEAL' | 'MISC';
  source: 'AUTO' | 'MANUAL';
  route: { id: string; name: string } | null;
  amountPaise: number;
  status: 'PAID' | 'UNPAID';
  paidAt: string | null;
  distanceFlag: boolean;
  remarks: string | null;
};
export type TaDaDays = { month: string; rows: TaDaDay[]; truncated: boolean };

export type DcrFigures = {
  reportedDays: number;
  lateDays: number;
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  calls: number;
  callsPerDay: number | null;
  geofence: { pass: number; fail: number; unverified: number; override: number };
  unconfirmed: number;
  notInPlan: number;
  offRouteCalls: number;
};
export type DcrMonth = DcrFigures & { month: string; state: 'ENDED' | 'OPEN' | 'FUTURE' };
export type DcrYear = { year: number; months: DcrMonth[]; totals: DcrFigures };

export type DcrCoverage = {
  month: string;
  assigned: number;
  visited: number;
  notVisited: { id: string; name: string; specialty: string }[];
};

export const getMyTaDaYear = (year: number) => apiGet<TaDaYear>(`/reports/me/ta-da?year=${year}`, { fy: true });
export const getMyTaDaDays = (month: string) => apiGet<TaDaDays>(`/reports/me/ta-da/days?month=${month}`, { fy: true });
export const getMyDcrYear = (year: number) => apiGet<DcrYear>(`/reports/me/dcr?year=${year}`, { fy: true });
export const getMyDcrCoverage = (month: string) => apiGet<DcrCoverage>(`/reports/me/dcr/coverage?month=${month}`, { fy: true });
