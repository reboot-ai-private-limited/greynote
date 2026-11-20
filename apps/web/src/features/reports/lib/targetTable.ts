/** What the targets table needs from each target of the report. */
export interface TargetLine {
  id: string;
  /** `null` = an old target for all products. */
  product: { id: string; name: string } | null;
  fromMonth: string;
  toMonth: string;
  amountPaise: number;
  targetQty: number | null;
}

const monthIndex = (m: string): number => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;

/**
 * The paise a target puts on each of `months`: its amount spread evenly over its own months, 0 outside them. The months add up to the amount
 * exactly: the paise that do not divide evenly go one each to its first months.
 */
export function perMonth(t: Pick<TargetLine, 'fromMonth' | 'toMonth' | 'amountPaise'>, months: readonly string[]): number[] {
  const span = Math.max(1, monthIndex(t.toMonth) - monthIndex(t.fromMonth) + 1);
  const each = Math.floor(t.amountPaise / span);
  const extra = t.amountPaise - each * span;
  return months.map((m) => {
    if (m < t.fromMonth || m > t.toMonth) return 0;
    return each + (monthIndex(m) - monthIndex(t.fromMonth) < extra ? 1 : 0);
  });
}

export interface MatrixRow {
  key: string;
  name: string;
  /** An old all-products target, not split by product yet. */
  old: boolean;
  months: number[];
  total: number;
  /** The targets behind the row, each with its own months: one for most products, several when targets overlap. */
  targets: { line: TargetLine; months: number[] }[];
}

export interface TargetMatrix {
  rows: MatrixRow[];
  monthTotals: number[];
  total: number;
}

/**
 * Products down the side, the year's months across: every target covering a month adds to it, so targets that overlap (a year, a quarter, a
 * month) are visibly added up. Old all-products targets get one row at the end of their own.
 */
export function buildMatrix(targets: readonly TargetLine[], months: readonly string[]): TargetMatrix {
  const byKey = new Map<string, MatrixRow>();
  for (const t of targets) {
    const key = t.product?.id ?? 'old';
    const row = byKey.get(key) ?? { key, name: t.product?.name ?? 'All products (not split by product)', old: t.product === null, months: months.map(() => 0), total: 0, targets: [] };
    const own = perMonth(t, months);
    own.forEach((v, i) => (row.months[i]! += v));
    row.targets.push({ line: t, months: own });
    byKey.set(key, row);
  }
  const rows = [...byKey.values()]
    .map((r) => ({ ...r, total: r.months.reduce((n, v) => n + v, 0), targets: [...r.targets].sort((a, b) => a.line.fromMonth.localeCompare(b.line.fromMonth) || a.line.toMonth.localeCompare(b.line.toMonth)) }))
    .sort((a, b) => Number(a.old) - Number(b.old) || a.name.localeCompare(b.name));
  const monthTotals = months.map((_, i) => rows.reduce((n, r) => n + r.months[i]!, 0));
  return { rows, monthTotals, total: monthTotals.reduce((n, v) => n + v, 0) };
}

/** The rows whose product name has the typed text in it (any case). An old not-split row always stays: it asks for something to be done. */
export function filterRows(rows: readonly MatrixRow[], text: string): MatrixRow[] {
  const needle = text.trim().toLowerCase();
  return needle === '' ? [...rows] : rows.filter((r) => r.old || r.name.toLowerCase().includes(needle));
}

export interface TargetGroup {
  key: string;
  fromMonth: string;
  toMonth: string;
  totalPaise: number;
  /** The product targets set over exactly these months, by product name. */
  items: TargetLine[];
  /** Old all-products targets over these months, which can be split. */
  old: TargetLine[];
}

/** The targets grouped by the months they cover ("Nov 2026 – Mar 2027"), earliest first, each with its total. */
export function groupByFrame(targets: readonly TargetLine[]): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const t of targets) {
    const key = `${t.fromMonth}|${t.toMonth}`;
    const g = groups.get(key) ?? { key, fromMonth: t.fromMonth, toMonth: t.toMonth, totalPaise: 0, items: [], old: [] };
    g.totalPaise += t.amountPaise;
    (t.product ? g.items : g.old).push(t);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.product!.name.localeCompare(b.product!.name)) }))
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth) || a.toMonth.localeCompare(b.toMonth));
}
