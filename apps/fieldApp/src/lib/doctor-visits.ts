import { apiGet } from './api';

/**
 * Each doctor's visit frequency (1–4 a month) against the calls made — `GET /reports/doctor-visits?month=` (shapes follow
 * packages/contracts reports.ts). An employee reads their own; a manager reads themself and their downline. Only calls on
 * submitted or approved daily reports count, so today's calls show once the day is submitted. Calls above a doctor's frequency
 * never offset another doctor's misses. The server orders the rows: most still to visit first.
 */
export type VisitStage = 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED';

export type DoctorVisitRow = {
  doctor: { id: string; name: string; specialty: string };
  frequency: number;
  made: number;
  /** `max(0, frequency − made)`. */
  missed: number;
  /** All visits made / some made / none yet — drives the badge and the sort. Absent from older servers. */
  stage?: VisitStage;
  /** Days this month the doctor was on an approved daily plan, up to yesterday. */
  plannedDays?: number;
  /** The day the doctor was planned and then never called on or after (a missed call carried forward); `null` if none. */
  missedSince?: string | null;
};

/** The stage, worked out the same way when an older server doesn't send it. */
export const stageOf = (r: DoctorVisitRow): VisitStage =>
  r.stage ?? (r.made >= r.frequency ? 'COMPLETE' : r.made > 0 ? 'IN_PROGRESS' : 'NOT_STARTED');

export type DoctorVisitMr = {
  mr: { id: string; name: string; employeeCode: string };
  quota: number;
  made: number;
  missed: number;
  doctors: number;
  completedDoctors: number;
  rows: DoctorVisitRow[];
};

export type DoctorVisitsReport = {
  month: string;
  mrs: DoctorVisitMr[];
  totals: { quota: number; made: number; missed: number; doctors: number; completedDoctors: number };
};

export const getDoctorVisits = (month: string) => apiGet<DoctorVisitsReport>(`/reports/doctor-visits?month=${month}`, { fy: true });
