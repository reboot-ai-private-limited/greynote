import type { SalaryMonthDto, SalaryRowDto, SalaryYearReportDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { monthTick } from './salesChart';

export const SALARY_STATE_LABEL: Record<SalaryMonthDto['state'], string> = {
  FINAL: 'Finalized',
  DRAFT: 'Draft',
  PARTIAL: 'Partly final',
  NONE: 'No run',
  OPEN: 'In progress',
  FUTURE: 'Not started',
};

export const SALARY_STATE_TONE: Record<SalaryMonthDto['state'], BadgeTone> = { FINAL: 'success', DRAFT: 'warning', PARTIAL: 'warning', NONE: 'danger', OPEN: 'neutral', FUTURE: 'neutral' };

/** Whole rupees, Indian grouping, no paise: `₹29,000`. For a grid where every cell has to fit. */
export const wholeRupees = (paise: number): string => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export interface SalaryMatrixRow {
  user: SalaryRowDto['user'];
  /** The run of each month the employee has one, by month. */
  byMonth: ReadonlyMap<string, SalaryRowDto>;
  /** The year's finalized net pay; a draft is not in it. */
  netFinalPaise: number;
  draftCount: number;
}

/** Employees by months: one row per employee, by name, with their runs; the total counts only finalized ones. */
export function salaryMatrix(report: Pick<SalaryYearReportDto, 'rows'>): SalaryMatrixRow[] {
  const by = new Map<string, SalaryMatrixRow & { map: Map<string, SalaryRowDto> }>();
  for (const r of report.rows) {
    const cur = by.get(r.user.id) ?? { user: r.user, byMonth: new Map<string, SalaryRowDto>(), map: new Map<string, SalaryRowDto>(), netFinalPaise: 0, draftCount: 0 };
    cur.map.set(r.month, r);
    if (r.status === 'FINALIZED') cur.netFinalPaise += r.netPaise;
    else cur.draftCount += 1;
    by.set(r.user.id, { ...cur, byMonth: cur.map });
  }
  return [...by.values()].map(({ map: _map, ...row }) => row).sort((a, b) => a.user.name.localeCompare(b.user.name));
}

/** The months to show as columns: those that have started (a future month has nothing yet). */
export const startedMonths = (months: readonly SalaryMonthDto[]): SalaryMonthDto[] => months.filter((m) => m.state !== 'FUTURE');

export const SALARY_MONTHS_CSV_HEADER = ['Month', 'Status', 'Employees finalized', 'Employees in draft', 'Base (INR)', 'Unpaid leave deduction (INR)', 'Absent deduction (INR)', 'Net pay (INR)', 'Employer contributions (INR)', 'Cost to company (INR)', 'Draft net pay, not counted (INR)', 'TA (INR)', 'DA (INR)', 'Reimbursements (INR)'] as const;

export function salaryMonthsCsv(report: Pick<SalaryYearReportDto, 'months'>): string {
  return toCsv(
    SALARY_MONTHS_CSV_HEADER,
    startedMonths(report.months).map((m) => [monthTick(m.month), SALARY_STATE_LABEL[m.state], m.finalEmployees, m.draftEmployees, ...[m.basePaise, m.leaveDeductionPaise, m.absentDeductionPaise, m.netPaise, m.employerPaise, m.costToCompanyPaise, m.draftNetPaise, m.taPaise, m.daPaise, m.reimbursementPaise].map(rupeesForCsv)]),
  );
}

export const SALARY_EMPLOYEES_CSV_HEADER = ['Month', 'Employee code', 'Employee', 'Status', 'Base (INR)', 'Unpaid leave deduction (INR)', 'Absent deduction (INR)', 'Net pay (INR)', 'Employer contributions (INR)', 'Cost to company (INR)'] as const;

export function salaryEmployeesCsv(report: Pick<SalaryYearReportDto, 'rows'>): string {
  return toCsv(
    SALARY_EMPLOYEES_CSV_HEADER,
    report.rows.map((r) => [monthTick(r.month), r.user.employeeCode, r.user.name, r.status === 'FINALIZED' ? 'Finalized' : 'Draft', ...[r.basePaise, r.leaveDeductionPaise, r.absentDeductionPaise, r.netPaise, r.employerPaise, r.costToCompanyPaise].map(rupeesForCsv)]),
  );
}

export const salaryMonthsFilename = (year: number): string => `salary-${year}-${String((year + 1) % 100).padStart(2, '0')}.csv`;
export const salaryEmployeesFilename = (year: number): string => `salary-employees-${year}-${String((year + 1) % 100).padStart(2, '0')}.csv`;
