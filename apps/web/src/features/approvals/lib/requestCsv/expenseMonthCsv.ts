import type { ExpenseStatementDto } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';

export const EXPENSE_MONTH_CSV_HEADER = ['Date', 'TA', 'DA', 'Other', 'Total', 'Remarks', 'Month status'] as const;

/** One employee's month, a row per day with TA, DA and Other in rupees, then a Total row. */
export function expenseMonthCsv(statement: Pick<ExpenseStatementDto, 'days' | 'totals' | 'status'>): string {
  const rows = statement.days.map((d) => [
    d.date,
    rupeesForCsv(d.taPaise),
    rupeesForCsv(d.daPaise),
    rupeesForCsv(d.otherPaise),
    rupeesForCsv(d.totalPaise),
    d.others.map((o) => o.remarks).filter(Boolean).join('; ') || null,
    statement.status,
  ]);
  const t = statement.totals;
  rows.push(['Total', rupeesForCsv(t.taPaise), rupeesForCsv(t.daPaise), rupeesForCsv(t.otherPaise), rupeesForCsv(t.totalPaise), null, statement.status]);
  return toCsv(EXPENSE_MONTH_CSV_HEADER, rows);
}
