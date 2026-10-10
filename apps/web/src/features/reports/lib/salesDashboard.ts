import type { SalesDashboardComplianceDto, SalesDashboardRowDto } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { financialYearRange } from '@/lib/financial-year';

export type RangePreset = 'today' | 'week' | 'custom';

export const PRESET_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom' },
] as const;

/** `date` plus `days` (negative for earlier), as `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The days a preset covers, ending today. "Last 7 days" is today and the six before it. */
export function presetRange(
  preset: Exclude<RangePreset, 'custom'>,
  today: string,
): { from: string; to: string } {
  return preset === 'today' ? { from: today, to: today } : { from: addDays(today, -6), to: today };
}

export function parsePreset(raw: string): RangePreset {
  return raw === 'week' || raw === 'custom' ? raw : 'today';
}

/**
 * A day's plan or report is a Yes/No; over several days it is "approved of N · submitted of N", N being the employee's working days
 * (no holiday, weekly off or leave). A single day that was not a working day says so rather than "No".
 */
export function complianceText(
  c: SalesDashboardComplianceDto,
  workingDays: number,
  singleDay: boolean,
): string {
  if (workingDays === 0) return singleDay ? 'Off' : '—';
  if (singleDay)
    return c.approved > 0 ? 'Yes, approved' : c.submitted > 0 ? 'Yes, submitted' : 'No';
  return `${c.approved}/${workingDays} approved · ${c.submitted}/${workingDays} submitted`;
}

export type ComplianceTone = 'success' | 'warning' | 'danger' | 'neutral';

export function complianceTone(
  c: SalesDashboardComplianceDto,
  workingDays: number,
): ComplianceTone {
  if (workingDays === 0) return 'neutral';
  if (c.submitted === 0) return 'danger';
  return c.approved >= workingDays ? 'success' : 'warning';
}

/** Whole percent of target reached, or null with no target. Over 100 is allowed. */
export function achievementPercent(
  row: Pick<SalesDashboardRowDto, 'targetPaise' | 'achievedPaise'>,
): number | null {
  if (!row.targetPaise || row.achievedPaise === null) return null;
  return Math.round((row.achievedPaise / row.targetPaise) * 100);
}

/** `YYYY-MM` for each month of a financial year, in order. */
export function financialYearMonths(year: number): string[] {
  const { from } = financialYearRange(year);
  const [y = 0, m = 1] = from.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** The routes cell: the first two names and how many more. */
export function routesText(routes: readonly string[]): string {
  if (routes.length === 0) return '—';
  return routes.length <= 2
    ? routes.join(', ')
    : `${routes.slice(0, 2).join(', ')} +${routes.length - 2}`;
}

export const SALES_DASHBOARD_CSV_HEADER = [
  'Employee code',
  'Employee',
  'Designation',
  'Zone',
  'Route',
  'Working days',
  'Plans submitted',
  'Plans approved',
  'Reports submitted',
  'Reports approved',
  'TA (INR)',
  'DA (INR)',
  'Target (INR)',
  'Primary (INR)',
  'Achievement (INR)',
] as const;

export function salesDashboardCsv(rows: readonly SalesDashboardRowDto[]): string {
  const money = (p: number | null) => (p === null ? '' : rupeesForCsv(p));
  return toCsv(
    SALES_DASHBOARD_CSV_HEADER,
    rows.map((r) => [
      r.employee.employeeCode,
      r.employee.name,
      r.designation,
      r.zone,
      r.routes.join('; '),
      r.workingDays,
      r.plan.submitted,
      r.plan.approved,
      r.dcr.submitted,
      r.dcr.approved,
      money(r.taPaise),
      money(r.daPaise),
      money(r.targetPaise),
      money(r.primaryPaise),
      money(r.achievedPaise),
    ]),
  );
}

export const salesDashboardFilename = (from: string, to: string): string =>
  from === to ? `sales-dashboard-${from}.csv` : `sales-dashboard-${from}-to-${to}.csv`;
