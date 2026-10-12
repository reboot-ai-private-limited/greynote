import { apiGet } from './api';

/**
 * Each doctor's visit frequency (1–6 a month) against the calls made — `GET /reports/doctor-visits?month=` (shapes follow
 * packages/contracts reports.ts). An employee reads their own; a manager reads themself and their downline. Only calls on
 * submitted or approved daily reports count, so today's calls show once the day is submitted. Calls above a doctor's frequency
 * never offset another doctor's misses.
 */
export type DoctorVisitRow = {
  doctor: { id: string; name: string; specialty: string };
  frequency: number;
  made: number;
  /** `max(0, frequency − made)`. */
  missed: number;
  plannedDays?: number;
  missedSince?: string | null;
};

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
