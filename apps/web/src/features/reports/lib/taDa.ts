import type { TaDaDaysDto, TaDaMonthDto, TaDaMrRowDto, TaDaYearReportDto } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { monthTick } from './salesChart';

export const EXPENSE_TYPE_LABEL: Record<TaDaDaysDto['rows'][number]['type'], string> = { TA: 'TA', DA: 'DA', TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other', OTHER: 'Other' };

/** The employees of one month, biggest total first (ties by name). */
export function rowsOfMonth(report: Pick<TaDaYearReportDto, 'rows'>, month: string): TaDaMrRowDto[] {
  return report.rows.filter((r) => r.month === month).sort((a, b) => b.totalPaise - a.totalPaise || a.mr.name.localeCompare(b.mr.name));
}

/** The month to open first: the latest one that has any claims, else the latest that has started. */
export function defaultMonth(months: readonly TaDaMonthDto[]): string {
  const started = months.filter((m) => m.state !== 'FUTURE');
  return started.filter((m) => m.employees > 0).at(-1)?.month ?? started.at(-1)?.month ?? '';
}

/** The share of a month's total that has been paid, 0 to 100, whole percent; 0 when there is nothing. */
export const paidPercent = (f: { totalPaise: number; paidPaise: number }): number => (f.totalPaise <= 0 ? 0 : Math.round((f.paidPaise / f.totalPaise) * 100));

const money = (p: number): string => rupeesForCsv(p);

export const TADA_MONTHS_CSV_HEADER = ['Month', 'Employees', 'TA (INR)', 'DA (INR)', 'Reimbursements (INR)', 'Total (INR)', 'Paid (INR)', 'Unpaid (INR)', 'TA rows with distance not calculated'] as const;

export function taDaMonthsCsv(report: Pick<TaDaYearReportDto, 'months'>): string {
  return toCsv(
    TADA_MONTHS_CSV_HEADER,
    report.months.filter((m) => m.state !== 'FUTURE').map((m) => [monthTick(m.month), m.employees, money(m.taPaise), money(m.daPaise), money(m.reimbursementPaise), money(m.totalPaise), money(m.paidPaise), money(m.unpaidPaise), m.flaggedRows]),
  );
}

export const TADA_EMPLOYEES_CSV_HEADER = ['Month', 'Employee code', 'Employee', 'TA (INR)', 'DA (INR)', 'Reimbursements (INR)', 'Total (INR)', 'Paid (INR)', 'Unpaid (INR)', 'TA rows with distance not calculated'] as const;

export function taDaEmployeesCsv(rows: readonly TaDaMrRowDto[]): string {
  return toCsv(TADA_EMPLOYEES_CSV_HEADER, rows.map((r) => [monthTick(r.month), r.mr.employeeCode, r.mr.name, money(r.taPaise), money(r.daPaise), money(r.reimbursementPaise), money(r.totalPaise), money(r.paidPaise), money(r.unpaidPaise), r.flaggedRows]));
}

export const TADA_DAYS_CSV_HEADER = ['Date', 'Type', 'Route', 'Amount (INR)', 'Status', 'Paid on', 'Distance not calculated', 'Remarks'] as const;

export function taDaDaysCsv(d: Pick<TaDaDaysDto, 'rows'>): string {
  return toCsv(TADA_DAYS_CSV_HEADER, d.rows.map((r) => [r.date, EXPENSE_TYPE_LABEL[r.type], r.route?.name ?? '', money(r.amountPaise), r.status === 'PAID' ? 'Paid' : 'Unpaid', r.paidAt ? r.paidAt.slice(0, 10) : '', r.distanceFlag ? 'Yes' : '', r.remarks ?? '']));
}

export const taDaYearFilename = (year: number): string => `ta-da-${year}-${String((year + 1) % 100).padStart(2, '0')}.csv`;
export const taDaMonthFilename = (month: string): string => `ta-da-employees-${month}.csv`;
export const taDaDaysFilename = (employeeCode: string, month: string): string => `ta-da-${employeeCode.toLowerCase()}-${month}.csv`;
