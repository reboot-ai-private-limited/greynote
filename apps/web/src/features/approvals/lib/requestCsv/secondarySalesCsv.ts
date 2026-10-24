import type { EmployeeSalesDto } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';

export const SECONDARY_SALES_CSV_HEADER = ['Product', 'SKU', 'Units', 'PTS', 'Amount at PTS', 'Status'] as const;

/** The secondary an employee entered for a month, a row per product they entered (the rest have nothing to approve), then a Total row. */
export function secondarySalesCsv(sales: Pick<EmployeeSalesDto, 'lines'>): string {
  const lines = sales.lines.filter((l) => l.secondaryQty !== null);
  const rows: Array<Array<string | number | null>> = lines.map((l) => [
    l.product.name,
    l.product.sku,
    l.secondaryQty,
    l.ptsPaise === null ? null : rupeesForCsv(l.ptsPaise),
    l.secondaryAmountPaise === null ? null : rupeesForCsv(l.secondaryAmountPaise),
    l.secondaryStatus,
  ]);
  const units = lines.reduce((n, l) => n + (l.secondaryQty ?? 0), 0);
  const amount = lines.reduce((n, l) => n + (l.secondaryAmountPaise ?? 0), 0);
  rows.push(['Total', null, units, null, rupeesForCsv(amount), null]);
  return toCsv(SECONDARY_SALES_CSV_HEADER, rows);
}
