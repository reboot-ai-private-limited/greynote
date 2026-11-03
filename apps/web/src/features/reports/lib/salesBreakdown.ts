import type { SalesByDistributorDto, SalesByEmployeeDto, SalesByProductDto } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { financialYearLabel, financialYearRange } from '@/lib/financial-year';

export type SalesPeriod = 'month' | 'quarter' | 'year';

export const SALES_PERIOD_OPTIONS: ReadonlyArray<{ value: SalesPeriod; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export const parseSalesPeriod = (raw: string): SalesPeriod => (raw === 'month' || raw === 'quarter' ? raw : 'year');

/** The twelve months (`YYYY-MM`) of financial year `fy`, in order. */
export function fyMonths(fy: number): string[] {
  const [y = 0, m = 1] = financialYearRange(fy).from.slice(0, 7).split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const idx = m - 1 + i;
    return `${y + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });
}

/** Quarter `q` (1 to 4) of the year, as its three months. */
export const quarterMonths = (fy: number, q: number): string[] => fyMonths(fy).slice((q - 1) * 3, q * 3);

/** Which quarter of financial year `fy` a month falls in, or 1 when it is not in the year (a past year viewed today). */
export function quarterOf(fy: number, month: string): number {
  const i = fyMonths(fy).indexOf(month);
  return i < 0 ? 1 : Math.floor(i / 3) + 1;
}

/** The month to open on: this month if it is in the year, otherwise the year's last month (a year already over) or first. */
export function defaultMonth(fy: number, thisMonth: string): string {
  const months = fyMonths(fy);
  if (months.includes(thisMonth)) return thisMonth;
  return thisMonth > months[11]! ? months[11]! : months[0]!;
}

export const QUARTER_OPTIONS = (fy: number, monthName: (m: string) => string) =>
  [1, 2, 3, 4].map((q) => {
    const m = quarterMonths(fy, q);
    return { value: String(q), label: `Q${q} (${monthName(m[0]!)} to ${monthName(m[2]!)})` };
  });

export function windowLabel(fy: number, period: SalesPeriod, month: string, quarter: number): string {
  return period === 'year' ? financialYearLabel(fy) : period === 'quarter' ? `Q${quarter}, ${financialYearLabel(fy)}` : month;
}

export const salesBreakdownFilename = (kind: 'product' | 'distributor' | 'employee', label: string): string => `sales-by-${kind}-${label.replace(/[^A-Za-z0-9-]+/g, '-')}.csv`;

export const productCsv = (r: SalesByProductDto): string =>
  toCsv(
    ['Product', 'SKU', 'Primary units', 'Primary (₹)', 'Secondary units', 'Secondary (₹)', 'Target (₹)', 'Achievement %'],
    r.rows.map((x) => [x.product.name, x.product.sku, x.primaryQty, rupeesForCsv(x.primaryPaise), x.secondaryQty, rupeesForCsv(x.secondaryPaise), rupeesForCsv(x.targetPaise), x.achievementPercent]),
  );

export const distributorCsv = (r: SalesByDistributorDto): string =>
  toCsv(
    ['Distributor', 'Products', 'Months counted', 'Primary units', 'Primary (₹)', 'Secondary units', 'Secondary (₹)'],
    r.rows.map((x) => [x.distributor.name, x.products, x.countedMonths, x.primaryQty, rupeesForCsv(x.primaryPaise), x.secondaryQty, rupeesForCsv(x.secondaryPaise)]),
  );

export const employeeCsv = (r: SalesByEmployeeDto): string =>
  toCsv(
    ['Employee', 'Code', 'Designation', 'MRs added up', 'Target (₹)', 'Primary (₹)', 'Achieved (₹)', 'Achievement %'],
    r.rows.map((x) => [x.employee.name, x.employee.employeeCode, x.designation, x.mrCount, rupeesForCsv(x.targetPaise), rupeesForCsv(x.primaryPaise), rupeesForCsv(x.achievedPaise), x.achievementPercent]),
  );
