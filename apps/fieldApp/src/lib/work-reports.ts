import { apiGetFile } from './api';
import { deliverXlsx } from './csv';

const clean = (name: string) => name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * One employee's Monthly Work report (Excel) for a month: a row for every day (weekly off, holiday, paid or unpaid leave, worked, absent) with the Tour Plan
 * and Daily Plan routes, whether the DCR was sent, doctor calls, missed and carried doctors, follow-ups, chemist calls, orders and that day's TA, DA and
 * other expenses, then the month's totals. The server builds it.
 */
export async function downloadMonthlyWorkReport(person: { id: string; name: string }, month: string, label: string): Promise<string | null> {
  const bytes = await apiGetFile(`/reports/employee-monthly-work?userId=${person.id}&month=${month}`);
  return deliverXlsx(`GREYNOTE MONTHLY WORK ${month} ${clean(person.name)}.xlsx`, bytes, `${person.name} · Monthly work · ${label}`);
}
