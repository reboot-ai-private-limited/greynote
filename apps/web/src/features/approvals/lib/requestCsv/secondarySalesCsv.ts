import { rupeesForCsv, toCsv } from '@/lib/csv';

export const SECONDARY_SALES_CSV_HEADER = ['Distributor', 'Product', 'SKU', 'Opening', 'Primary', 'Secondary', 'Closing', 'PTS', 'Secondary at PTS'] as const;

/** What both a MR's report and a manager's team report hold for one distributor: its products with their figures. */
interface DistributorFigures {
  name: string;
  lines: ReadonlyArray<{ product: { name: string; sku: string }; openingQty: number; primaryQty: number; issuedQty: number; closingQty: number; ptsPaise: number | null; issuedAmountPaise: number | null; saved?: boolean }>;
}

/** A month of secondary sales, a row per distributor and product that has figures (an MR's unsent defaults are left out), then a Total row. */
export function secondarySalesCsv(report: { distributors: readonly DistributorFigures[] }): string {
  const lines = report.distributors.flatMap((d) => d.lines.filter((l) => l.saved !== false).map((l) => ({ distributor: d.name, ...l })));
  const rows: Array<Array<string | number | null>> = lines.map((l) => [l.distributor, l.product.name, l.product.sku, l.openingQty, l.primaryQty, l.issuedQty, l.closingQty, l.ptsPaise === null ? null : rupeesForCsv(l.ptsPaise), l.issuedAmountPaise === null ? null : rupeesForCsv(l.issuedAmountPaise)]);
  const sum = (pick: (l: (typeof lines)[number]) => number) => lines.reduce((n, l) => n + pick(l), 0);
  rows.push(['Total', null, null, sum((l) => l.openingQty), sum((l) => l.primaryQty), sum((l) => l.issuedQty), sum((l) => l.closingQty), null, rupeesForCsv(sum((l) => l.issuedAmountPaise ?? 0))]);
  return toCsv(SECONDARY_SALES_CSV_HEADER, rows);
}
