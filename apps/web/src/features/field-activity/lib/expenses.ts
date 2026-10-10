import type { ExpenseAuditRowDto, ExpenseTypeDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';

export const EXPENSE_TYPE_LABEL: Record<ExpenseTypeDto, string> = {
  TA: 'Travel allowance (TA)',
  DA: 'Daily allowance (DA)',
  TRAVEL: 'Travel',
  MEAL: 'Meal',
  MISC: 'Other',
  OTHER: 'Other',
};

export const PAYMENT_LABEL: Record<ExpenseAuditRowDto['paymentStatus'], string> = {
  UNPAID: 'Unpaid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_TONE: Record<ExpenseAuditRowDto['paymentStatus'], BadgeTone> = {
  UNPAID: 'warning',
  PAID: 'success',
  CANCELLED: 'neutral',
};

/** The API lists at most this many; a full page means there may be more than were returned. */
export const AUDIT_CAP = 500;

export const isCapped = (rows: readonly unknown[]): boolean => rows.length >= AUDIT_CAP;

/** A row the Accountant can pay now. A paid or cancelled one cannot be, and the server refuses it. */
export function isPayable(row: Pick<ExpenseAuditRowDto, 'paymentStatus'>): boolean {
  return row.paymentStatus === 'UNPAID';
}

export const payableRows = <T extends Pick<ExpenseAuditRowDto, 'paymentStatus'>>(rows: readonly T[]): T[] => rows.filter(isPayable);

export interface AuditTotals {
  unpaidPaise: number;
  paidPaise: number;
  unpaidCount: number;
  paidCount: number;
}

/** What is still owed and what has been paid, leaving out cancelled rows (a report that was sent back owes nothing). */
export function auditTotals(rows: readonly Pick<ExpenseAuditRowDto, 'amountPaise' | 'paymentStatus'>[]): AuditTotals {
  const t: AuditTotals = { unpaidPaise: 0, paidPaise: 0, unpaidCount: 0, paidCount: 0 };
  for (const r of rows) {
    if (r.paymentStatus === 'UNPAID') {
      t.unpaidPaise += r.amountPaise;
      t.unpaidCount += 1;
    } else if (r.paymentStatus === 'PAID') {
      t.paidPaise += r.amountPaise;
      t.paidCount += 1;
    }
  }
  return t;
}

export const sumPaise = (rows: readonly Pick<ExpenseAuditRowDto, 'amountPaise'>[]): number => rows.reduce((n, r) => n + r.amountPaise, 0);

/** A travel allowance whose Route distance could not be calculated is artificially low: pay it only knowing so. */
export const flaggedRows = <T extends Pick<ExpenseAuditRowDto, 'distanceFlag'>>(rows: readonly T[]): T[] => rows.filter((r) => r.distanceFlag);

export interface MarkPaidResult {
  paid: string[];
  failed: { id: string; message: string }[];
}

/**
 * Marks each row paid on its own (the API has no bulk call). Marking a paid row again changes nothing, so a retry after a dropped
 * connection is safe; one refused row never stops the rest, and each failure keeps the server's message.
 */
export async function markRowsPaid(send: (id: string) => Promise<unknown>, ids: readonly string[]): Promise<MarkPaidResult> {
  const result: MarkPaidResult = { paid: [], failed: [] };
  for (const id of ids) {
    try {
      await send(id);
      result.paid.push(id);
    } catch (error) {
      result.failed.push({ id, message: error instanceof Error ? error.message : 'Could not mark it paid.' });
    }
  }
  return result;
}

export function markPaidMessage(result: MarkPaidResult, total: number): string {
  return result.failed.length === 0
    ? `${result.paid.length} of ${total} marked paid.`
    : `${result.paid.length} of ${total} marked paid. ${result.failed.length} could not be: they are still unpaid.`;
}

export const EXPENSE_CSV_HEADER = ['Employee code', 'Employee', 'Report day', 'Type', 'Source', 'Amount (INR)', 'Status', 'Paid on', 'Remarks', 'Distance not calculated'] as const;

/** The audit list as a sheet to open in a spreadsheet. Amounts are plain numbers; dates are ISO so they sort. */
export function expensesCsv(rows: readonly ExpenseAuditRowDto[]): string {
  return toCsv(
    EXPENSE_CSV_HEADER,
    rows.map((r) => [
      r.employeeCode,
      r.userName,
      r.reportDate,
      EXPENSE_TYPE_LABEL[r.type],
      r.source === 'AUTO' ? 'Calculated' : 'Claimed',
      rupeesForCsv(r.amountPaise),
      PAYMENT_LABEL[r.paymentStatus],
      r.paidAt ? r.paidAt.slice(0, 10) : '',
      r.remarks ?? '',
      r.distanceFlag ? 'Yes' : '',
    ]),
  );
}

/** `expenses-2026-10-01-to-2026-10-03.csv`. */
export const expensesFilename = (from: string, to: string): string => `expenses-${from}-to-${to}.csv`;

/** "3 Oct 2026" for a row's report day (it is a `YYYY-MM-DD`). */
export const reportDayLabel = (date: string): string => formatDate(date);

/** `October 2026`: the month a payment made today is counted in, since payroll counts by the month an expense was marked paid. */
export function paidInMonthLabel(today: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${today.slice(0, 7)}-01T00:00:00Z`));
}
