import type { SalesByEmployeeDto, SalesByProductDto } from '@greynote/contracts';
import type { SalesWindowQuery } from '@/lib/api/endpoints/reports';
import { fyMonths, quarterMonths } from './salesBreakdown';

/** The trend view: one row per product or employee, one column per month (or quarter) of the financial year, and a year total. */
export type TrendKind = 'product' | 'employee';
export type TrendGrain = 'month' | 'quarter';

export interface TrendColumn {
  key: string;
  label: string;
  window: SalesWindowQuery;
}

/** The twelve months, or the four quarters, of financial year `fy`, each with the window that asks the API for it. */
export function trendColumns(fy: number, grain: TrendGrain, monthName: (m: string) => string): TrendColumn[] {
  if (grain === 'quarter') return [1, 2, 3, 4].map((q) => ({ key: `Q${q}`, label: `Q${q} (${monthName(quarterMonths(fy, q)[0]!)} – ${monthName(quarterMonths(fy, q)[2]!)})`, window: { year: fy, period: 'quarter', quarter: q } }));
  return fyMonths(fy).map((m) => ({ key: m, label: monthName(m), window: { year: fy, period: 'month', month: m } }));
}

export interface TrendCell {
  valuePaise: number;
  targetPaise: number;
  /** Value against target; null when there is no target. */
  percent: number | null;
}

export interface TrendRow {
  id: string;
  label: string;
  /** Secondary text: the employee code or the SKU. */
  sub: string;
  cells: TrendCell[];
  total: TrendCell;
}

const cell = (valuePaise: number, targetPaise: number): TrendCell => ({ valuePaise, targetPaise, percent: targetPaise > 0 ? Math.round((valuePaise / targetPaise) * 100) : null });
const EMPTY = cell(0, 0);

interface Entry {
  id: string;
  label: string;
  sub: string;
  value: number;
  target: number;
}

const productEntries = (r: SalesByProductDto | undefined): Entry[] => (r?.rows ?? []).map((x) => ({ id: x.product.id, label: x.product.name, sub: x.product.sku, value: x.secondaryPaise, target: x.targetPaise }));
const employeeEntries = (r: SalesByEmployeeDto | undefined): Entry[] => (r?.rows ?? []).map((x) => ({ id: x.employee.id, label: x.employee.name, sub: x.employee.employeeCode, value: x.achievedPaise, target: x.targetPaise }));

/** Joins the per-column reports on id. A row missing from a column (no sales, no target) is a zero cell, not a gap. Rows come out most-sold-first. */
function build(columns: readonly (readonly Entry[])[], year: readonly Entry[]): TrendRow[] {
  const rows = new Map<string, TrendRow>();
  const ensure = (e: Entry) => {
    let r = rows.get(e.id);
    if (!r) {
      r = { id: e.id, label: e.label, sub: e.sub, cells: columns.map(() => EMPTY), total: EMPTY };
      rows.set(e.id, r);
    }
    return r;
  };
  columns.forEach((entries, i) => {
    for (const e of entries) ensure(e).cells[i] = cell(e.value, e.target);
  });
  for (const e of year) ensure(e).total = cell(e.value, e.target);
  return sortTrend([...rows.values()], { key: 'total', order: 'desc' });
}

export const productTrend = (columns: readonly (SalesByProductDto | undefined)[], year: SalesByProductDto | undefined): TrendRow[] => build(columns.map(productEntries), productEntries(year));
export const employeeTrend = (columns: readonly (SalesByEmployeeDto | undefined)[], year: SalesByEmployeeDto | undefined): TrendRow[] => build(columns.map(employeeEntries), employeeEntries(year));

/** Sort by name, by the year total, or by one column's value (`key` is the column index as a string). Ties by name. */
export function sortTrend(rows: readonly TrendRow[], sort: { key: string; order: 'asc' | 'desc' }): TrendRow[] {
  const dir = sort.order === 'asc' ? 1 : -1;
  const value = (r: TrendRow) => (sort.key === 'total' ? r.total.valuePaise : r.cells[Number(sort.key)]?.valuePaise ?? 0);
  return [...rows].sort((a, b) => (sort.key === 'label' ? dir * a.label.localeCompare(b.label) : dir * (value(a) - value(b)) || a.label.localeCompare(b.label)));
}

export interface OrgSummary {
  targetPaise: number;
  achievedPaise: number;
  percent: number | null;
  bestEmployee: { label: string; valuePaise: number } | null;
  bestProduct: { label: string; valuePaise: number } | null;
  /** Employees with a target who are under it, and how many have a target at all. */
  employeesBehind: number;
  employeesWithTarget: number;
  /** Products with a target that are under it, and how many have a target at all. */
  productsBehind: number;
  productsWithTarget: number;
}

/** The owner's one-glance read of the organisation for the window: overall against target, the best performers, and how many are behind. */
export function orgSummary(employees: SalesByEmployeeDto | undefined, products: SalesByProductDto | undefined): OrgSummary {
  const e = employeeEntries(employees);
  const p = productEntries(products);
  const best = (list: Entry[]) => {
    const top = [...list].sort((a, b) => b.value - a.value)[0];
    return top && top.value > 0 ? { label: top.label, valuePaise: top.value } : null;
  };
  const behind = (list: Entry[]) => list.filter((x) => x.target > 0 && x.value < x.target).length;
  const targeted = (list: Entry[]) => list.filter((x) => x.target > 0).length;
  const t = employees?.totals;
  return {
    targetPaise: t?.targetPaise ?? 0,
    achievedPaise: t?.achievedPaise ?? 0,
    percent: t?.achievementPercent ?? null,
    bestEmployee: best(e),
    bestProduct: best(p),
    employeesBehind: behind(e),
    employeesWithTarget: targeted(e),
    productsBehind: behind(p),
    productsWithTarget: targeted(p),
  };
}
