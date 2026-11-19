import { apiGetFile } from './api';
import { deliverXlsx } from './csv';

const clean = (name: string) => name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * One employee's approved Tour Plan (Excel) for a month: a row for every day (work type, trip, routes, From, To, work with, remarks). The server builds it, so
 * the phone and the web download the same file; only an approved plan is handed out (decision-log 2026-11-19).
 */
export async function downloadTourPlan(person: { id: string; name: string }, month: string, label: string): Promise<string | null> {
  const bytes = await apiGetFile(`/reports/tour-plan?userId=${person.id}&month=${month}`);
  return deliverXlsx(`GREYNOTE TOUR PLAN ${month} ${clean(person.name)}.xlsx`, bytes, `${person.name} · Tour Plan · ${label}`);
}

/**
 * One employee's Monthly Work report (Excel) for a month: a row for every day (weekly off, holiday, paid or unpaid leave, worked, absent) with the Tour Plan
 * and Daily Plan routes, whether the DCR was sent, doctor calls, missed and carried doctors, follow-ups, chemist calls, orders and that day's TA, DA and
 * other expenses, then the month's totals. The server builds it.
 */
export async function downloadMonthlyWorkReport(person: { id: string; name: string }, month: string, label: string): Promise<string | null> {
  const bytes = await apiGetFile(`/reports/employee-monthly-work?userId=${person.id}&month=${month}`);
  return deliverXlsx(`GREYNOTE MONTHLY WORK ${month} ${clean(person.name)}.xlsx`, bytes, `${person.name} · Monthly work · ${label}`);
}
