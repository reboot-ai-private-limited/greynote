import type { DcrCoverageDto, DcrFiguresDto, DcrMonthDto, DcrMrRowDto, DcrYearReportDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';
import { monthTick } from './salesChart';

/** The employees of one month, most calls first (ties by name). */
export function dcrRowsOfMonth(report: Pick<DcrYearReportDto, 'rows'>, month: string): DcrMrRowDto[] {
  return report.rows.filter((r) => r.month === month).sort((a, b) => b.calls - a.calls || a.mr.name.localeCompare(b.mr.name));
}

/** The month to open first: the latest one with any reported day, else the latest that has started. */
export function dcrDefaultMonth(months: readonly DcrMonthDto[]): string {
  const started = months.filter((m) => m.state !== 'FUTURE');
  return started.filter((m) => m.reportedDays > 0).at(-1)?.month ?? started.at(-1)?.month ?? '';
}

/** The share of calls the geofence confirmed (passed, or a manager overrode), whole percent; `null` with no calls. */
export function confirmedPercent(f: Pick<DcrFiguresDto, 'calls' | 'geofence'>): number | null {
  return f.calls <= 0 ? null : Math.round(((f.geofence.pass + f.geofence.override) / f.calls) * 100);
}

/** The share of reported days submitted late, whole percent; `null` with no reported day. */
export const latePercent = (f: Pick<DcrFiguresDto, 'reportedDays' | 'lateDays'>): number | null => (f.reportedDays <= 0 ? null : Math.round((f.lateDays / f.reportedDays) * 100));

export const callsPerDayText = (f: Pick<DcrFiguresDto, 'callsPerDay'>): string => (f.callsPerDay === null ? '—' : f.callsPerDay.toFixed(1));

const figureCells = (f: DcrFiguresDto) => [f.reportedDays, f.lateDays, f.doctorCalls, f.chemistCalls, f.followups, f.callsPerDay ?? '', f.geofence.pass, f.geofence.override, f.geofence.unverified, f.geofence.fail, f.notInPlan];
const FIGURE_HEADER = ['Days reported', 'Submitted late', 'Doctor calls', 'Chemist calls', 'Follow-ups', 'Calls per day', 'Geofence passed', 'Geofence overridden', 'Geofence unverified', 'Geofence failed', 'Not in plan'] as const;

export const DCR_MONTHS_CSV_HEADER = ['Month', 'Employees', ...FIGURE_HEADER] as const;

export function dcrMonthsCsv(report: Pick<DcrYearReportDto, 'months'>): string {
  return toCsv(DCR_MONTHS_CSV_HEADER, report.months.filter((m) => m.state !== 'FUTURE').map((m) => [monthTick(m.month), m.employees, ...figureCells(m)]));
}

export const DCR_EMPLOYEES_CSV_HEADER = ['Month', 'Employee code', 'Employee', ...FIGURE_HEADER] as const;

export function dcrEmployeesCsv(rows: readonly DcrMrRowDto[]): string {
  return toCsv(DCR_EMPLOYEES_CSV_HEADER, rows.map((r) => [monthTick(r.month), r.mr.employeeCode, r.mr.name, ...figureCells(r)]));
}

export const DCR_COVERAGE_CSV_HEADER = ['Doctor', 'Speciality'] as const;

/** The doctors not called on, one per row. */
export const dcrCoverageCsv = (c: Pick<DcrCoverageDto, 'notVisited'>): string => toCsv(DCR_COVERAGE_CSV_HEADER, c.notVisited.map((d) => [d.name, d.specialty]));

export const dcrYearFilename = (year: number): string => `dcr-${year}-${String((year + 1) % 100).padStart(2, '0')}.csv`;
export const dcrMonthFilename = (month: string): string => `dcr-employees-${month}.csv`;
export const dcrCoverageFilename = (employeeCode: string, month: string): string => `doctors-not-visited-${employeeCode.toLowerCase()}-${month}.csv`;
