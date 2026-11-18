import { apiGetFile } from './api';
import { deliverXlsx } from './csv';

const clean = (name: string) => name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** One employee's Daily Work report (Excel) for a month: day by day plan against work, doctors planned, visited, missed and carried, and the month's totals. The server builds it. */
export async function downloadDailyWorkReport(person: { id: string; name: string }, month: string, label: string): Promise<string | null> {
  const bytes = await apiGetFile(`/reports/employee-daily-work?userId=${person.id}&month=${month}`);
  return deliverXlsx(`GREYNOTE DAILY WORK ${month} ${clean(person.name)}.xlsx`, bytes, `${person.name} · Daily work · ${label}`);
}

/** One employee's Expense report (Excel) for a month: each day's route, TA, DA and own claims, the month's state and payment. */
export async function downloadExpenseReport(person: { id: string; name: string }, month: string, label: string): Promise<string | null> {
  const bytes = await apiGetFile(`/reports/employee-expenses?userId=${person.id}&month=${month}`);
  return deliverXlsx(`GREYNOTE EXPENSES ${month} ${clean(person.name)}.xlsx`, bytes, `${person.name} · Expenses · ${label}`);
}
