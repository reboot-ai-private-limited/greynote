import type { SalesMonthDto, SalesRowFlag, SalesStatementDto, SalesYearReportDto, StockReportDto, StockRowFlag } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { monthTick } from './salesChart';

export const SALES_FLAG_LABEL: Record<SalesRowFlag, string> = {
  NO_COUNT: 'No count',
  NEGATIVE_SECONDARY: 'Negative secondary',
  NEGATIVE_CLOSING: 'Negative closing',
  COUNT_MISMATCH: 'Field count ≠ statement',
  OPENING_MISMATCH: 'Opening ≠ last closing',
  UNPRICED: 'No price on the product',
};

export const SOURCE_LABEL = { STATEMENT: 'Statement', FIELD_COUNT: 'Field count', NONE: '' } as const;

export const STOCK_FLAG_LABEL: Record<StockRowFlag, string> = {
  NO_COUNT: 'No count',
  OPENING_MISMATCH: 'Opening ≠ last closing',
  NEGATIVE_SECONDARY: 'Negative secondary',
};

/** What to say under a month of the chart: how complete the secondary is, or why there is none. */
export function monthNote(m: SalesMonthDto): string {
  if (m.state === 'FUTURE') return 'Not started yet.';
  if (m.state === 'OPEN' && m.secondaryQty === null) return 'In progress: stock is counted after the month ends, so there is no secondary yet.';
  if (m.state === 'OPEN') return 'In progress: the secondary covers only what has been counted or stated so far.';
  if (m.secondaryQty === null) return 'No stock count or statement was entered, so there is no secondary.';
  const parts = [m.complete ? `All ${m.expectedDistributors} distributors counted.` : `${m.countedDistributors} of ${m.expectedDistributors} distributors counted: the secondary is only part of the picture.`];
  if (m.negativeRows > 0) parts.push(`${m.negativeRows} count${m.negativeRows === 1 ? '' : 's'} came out below zero and ${m.negativeRows === 1 ? 'is' : 'are'} left out.`);
  if (m.unpricedRows > 0) parts.push(`${m.unpricedRows} count${m.unpricedRows === 1 ? '' : 's'} of a product with no PTR ${m.unpricedRows === 1 ? 'is' : 'are'} left out of the value.`);
  return parts.join(' ');
}

const blank = (n: number | null): number | string => (n === null ? '' : n);
const money = (paise: number | null): string => (paise === null ? '' : rupeesForCsv(paise));

export const SALES_MONTHS_CSV_HEADER = ['Month', 'Primary quantity', 'Primary (INR)', 'Placed, not done (INR)', 'Secondary quantity', 'Secondary (INR)', 'Distributors counted', 'Distributors expected', 'Complete'] as const;

export function salesMonthsCsv(report: Pick<SalesYearReportDto, 'months'>): string {
  return toCsv(
    SALES_MONTHS_CSV_HEADER,
    report.months.filter((m) => m.state !== 'FUTURE').map((m) => [monthTick(m.month), m.primaryQty, rupeesForCsv(m.primaryPaise), rupeesForCsv(m.placedPaise), blank(m.secondaryQty), money(m.secondaryPaise), m.countedDistributors, m.expectedDistributors, m.complete ? 'Yes' : 'No']),
  );
}

export const STATEMENT_CSV_HEADER = ['Distributor', 'Product', 'SKU', 'Opening', 'Primary from orders', 'Adjustment', 'Primary', 'Primary (INR)', 'Placed, not done', 'Closing', 'Secondary', 'Secondary (INR)', 'Source', 'Notes'] as const;

export function statementCsv(s: Pick<SalesStatementDto, 'rows'>): string {
  return toCsv(
    STATEMENT_CSV_HEADER,
    s.rows.map((r) => [r.distributor.name, r.product.name, r.product.sku, blank(r.openingQty), r.orderPrimaryQty, r.adjustmentQty, r.primaryQty, rupeesForCsv(r.primaryPaise), r.placedQty, blank(r.closingQty), blank(r.secondaryQty), money(r.secondaryPaise), SOURCE_LABEL[r.source], r.flags.map((f) => SALES_FLAG_LABEL[f]).join('; ')]),
  );
}

export const STOCK_CSV_HEADER = ['Outlet type', 'Outlet', 'Product', 'SKU', 'Opening', 'Last month closing', 'Closing', 'Notes'] as const;

export function stockCsv(r: Pick<StockReportDto, 'rows'>): string {
  return toCsv(
    STOCK_CSV_HEADER,
    r.rows.map((x) => [x.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist', x.outlet.name, x.product?.name ?? '', x.product?.sku ?? '', blank(x.openingQty), blank(x.previousClosingQty), blank(x.closingQty), x.flags.map((f) => STOCK_FLAG_LABEL[f]).join('; ')]),
  );
}

export const salesFilename = (year: number): string => `sales-${year}-${String((year + 1) % 100).padStart(2, '0')}.csv`;
export const statementFilename = (month: string): string => `stock-and-sales-${month}.csv`;
export const stockFilename = (month: string): string => `stock-${month}.csv`;
