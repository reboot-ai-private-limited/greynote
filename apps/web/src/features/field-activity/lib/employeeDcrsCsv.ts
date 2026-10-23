import type { DcrSummaryDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';

export const EMPLOYEE_DCRS_CSV_HEADER = ['Date', 'Status', 'Remarks', 'Submitted at', 'Decided at', 'Round'] as const;

/** An employee's daily reports, one per day, oldest first (a statement reads down the calendar). */
export function employeeDcrsCsv(dcrs: readonly DcrSummaryDto[]): string {
  return toCsv(
    EMPLOYEE_DCRS_CSV_HEADER,
    [...dcrs]
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
      .map((d) => [d.reportDate, d.status, d.remarks, d.approval?.submittedAt, d.approval?.decidedAt, d.approval?.cycle]),
  );
}

export const employeeDcrsFilename = (employeeCode: string, financialYearLabel: string): string =>
  `dcr-${employeeCode.toLowerCase()}-${financialYearLabel.replace('–', '-')}.csv`;
