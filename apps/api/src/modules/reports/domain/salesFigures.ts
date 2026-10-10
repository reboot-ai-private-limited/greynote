import type { SalesMonthDto, SalesRowFlag, SalesStatementRowDto } from '@greynote/contracts';
import { stockFigure, type CountFigure, type StatementFigure } from '@/shared/stock/stockFigures.js';

/** One line of Sales' picture of orders to distributors (the shape of its public `sumDistributorOrders`). */
export interface OrderSum {
  month: string;
  distributorId: string;
  productId: string;
  status: 'DONE' | 'PLACED';
  quantity: number;
  amountPaise: number;
}

/** One distributor's count of one product for one month. */
export interface StockCount {
  distributorId: string;
  productId: string;
  month: string;
  openingQty: number;
  closingQty: number;
}

/** Admin's statement line for one distributor, product and month (Sales' `StockStatement`, as Reports sees it). */
export interface StatementCount {
  distributorId: string;
  productId: string;
  month: string;
  openingQty: number;
  secondaryQty: number | null;
  adjustmentQty: number;
}

/** What a distributor sold on: it had `opening`, received `primary` this month, and has `closing` left. Below zero is a counting or entry error. */
export const secondaryQty = (openingQty: number, primaryQty: number, closingQty: number): number => openingQty + primaryQty - closingQty;

/** A quantity at a price in whole paise, `null` when there is no price. */
export const valueOf = (qty: number, pricePaise: number | null | undefined): number | null => (pricePaise === null || pricePaise === undefined ? null : qty * pricePaise);

/** The twelve months of a financial year from its first day (`YYYY-MM-DD`): `['2026-04', …, '2027-03']`. */
export function yearMonths(firstDay: string): string[] {
  let [y = 0, m = 1] = firstDay.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export const previousMonth = (month: string): string => {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const key = (...parts: string[]) => parts.join('|');

const countFigure = (c: StockCount | undefined): CountFigure | undefined => (c ? { openingQty: c.openingQty, closingQty: c.closingQty } : undefined);
const statementFigure = (s: StatementCount | undefined): StatementFigure | undefined => (s ? { openingQty: s.openingQty, secondaryQty: s.secondaryQty, adjustmentQty: s.adjustmentQty } : undefined);

/** What a month's Done orders came to, per distributor and product, as a lookup. */
function doneByKey(sums: readonly OrderSum[]): Map<string, { qty: number; paise: number }> {
  const map = new Map<string, { qty: number; paise: number }>();
  for (const s of sums) {
    if (s.status !== 'DONE') continue;
    const k = key(s.month, s.distributorId, s.productId);
    const cur = map.get(k) ?? { qty: 0, paise: 0 };
    map.set(k, { qty: cur.qty + s.quantity, paise: cur.paise + s.amountPaise });
  }
  return map;
}

/**
 * The twelve points of the Sales chart. Primary is every Done order to a distributor in the month it was marked Done, plus Admin's adjustments
 * (valued at each product's PTS). Secondary comes from `stockFigure`: the distributor's statement when Admin has entered one, otherwise the field
 * workers' counts (opening + primary − closing); it exists only for what was counted or stated, and one that comes out negative is left out of
 * the totals and counted as an error. A month still in progress has its primary and no secondary until something is counted or stated; a future
 * month has nothing.
 */
export function buildSalesMonths(input: {
  months: readonly string[];
  currentMonth: string;
  orderSums: readonly OrderSum[];
  stock: readonly StockCount[];
  /** Admin's statements; none is the same as before they existed. */
  statements?: readonly StatementCount[];
  /** Product id → PTR in paise, `null` when the card has none. */
  ptr: ReadonlyMap<string, number | null>;
  /** Product id → PTS in paise, for valuing an adjustment to primary. */
  pts?: ReadonlyMap<string, number | null>;
  /** Ids of the active distributors, for the completeness of each month. */
  expectedDistributorIds: readonly string[];
}): SalesMonthDto[] {
  const done = doneByKey(input.orderSums);
  const expected = new Set(input.expectedDistributorIds);
  const statements = input.statements ?? [];
  return input.months.map((month): SalesMonthDto => {
    const state = month > input.currentMonth ? 'FUTURE' : month === input.currentMonth ? 'OPEN' : 'ENDED';
    const blank: SalesMonthDto = { month, state, primaryQty: 0, primaryPaise: 0, placedQty: 0, placedPaise: 0, secondaryQty: null, secondaryPaise: null, countedDistributors: 0, expectedDistributors: expected.size, complete: false, negativeRows: 0, unpricedRows: 0 };
    if (state === 'FUTURE') return blank;

    let primaryQty = 0;
    let primaryPaise = 0;
    let placedQty = 0;
    let placedPaise = 0;
    let unpricedRows = 0;
    for (const s of input.orderSums) {
      if (s.month !== month) continue;
      if (s.status === 'DONE') {
        primaryQty += s.quantity;
        primaryPaise += s.amountPaise;
      } else {
        placedQty += s.quantity;
        placedPaise += s.amountPaise;
      }
    }

    const counts = new Map(input.stock.filter((c) => c.month === month).map((c) => [key(c.distributorId, c.productId), c]));
    const stated = new Map(statements.filter((c) => c.month === month).map((c) => [key(c.distributorId, c.productId), c]));
    for (const st of stated.values()) {
      primaryQty += st.adjustmentQty;
      const value = valueOf(st.adjustmentQty, input.pts?.get(st.productId));
      if (st.adjustmentQty !== 0 && value === null) unpricedRows += 1;
      else if (value !== null) primaryPaise += value;
    }

    const counted = new Set<string>();
    let evaluated = 0;
    let secQty = 0;
    let secPaise = 0;
    let negativeRows = 0;
    for (const k of new Set([...counts.keys(), ...stated.keys()])) {
      const count = counts.get(k);
      const statement = stated.get(k);
      const [distributorId = '', productId = ''] = k.split('|');
      const figure = stockFigure({ orderQty: done.get(key(month, distributorId, productId))?.qty ?? 0, count: countFigure(count), statement: statementFigure(statement) });
      if (figure.secondaryQty === null) continue;
      evaluated += 1;
      if (expected.has(distributorId)) counted.add(distributorId);
      if (figure.secondaryQty < 0) {
        negativeRows += 1;
        continue;
      }
      secQty += figure.secondaryQty;
      const value = valueOf(figure.secondaryQty, input.ptr.get(productId));
      if (value === null) unpricedRows += 1;
      else secPaise += value;
    }
    const hasSecondary = evaluated > 0;
    return {
      ...blank,
      primaryQty,
      primaryPaise,
      placedQty,
      placedPaise,
      secondaryQty: hasSecondary ? secQty : null,
      secondaryPaise: hasSecondary ? secPaise : null,
      countedDistributors: counted.size,
      complete: expected.size > 0 && counted.size >= expected.size,
      negativeRows,
      unpricedRows,
    };
  });
}

/**
 * One month's statement: a row for each distributor and product that has a count, a statement or an order that month. Each row's figures come from
 * `stockFigure`; a row with nothing counted or stated says so, and one whose opening is not what it closed the month before with is flagged.
 * `orderSums`, `stock` and `statements` may include the previous month, which the opening check needs.
 */
export function buildStatement(input: {
  month: string;
  orderSums: readonly OrderSum[];
  stock: readonly StockCount[];
  statements?: readonly StatementCount[];
  ptr: ReadonlyMap<string, number | null>;
  pts?: ReadonlyMap<string, number | null>;
}): Array<Omit<SalesStatementRowDto, 'distributor' | 'product'> & { distributorId: string; productId: string }> {
  const { month } = input;
  const prev = previousMonth(month);
  const statements = input.statements ?? [];
  const byKey = <T extends { distributorId: string; productId: string; month: string }>(rows: readonly T[], m: string) => new Map(rows.filter((r) => r.month === m).map((r) => [key(r.distributorId, r.productId), r]));
  const counts = byKey(input.stock, month);
  const stated = byKey(statements, month);
  const beforeCounts = byKey(input.stock, prev);
  const beforeStated = byKey(statements, prev);
  const orders = new Map<string, { doneQty: number; donePaise: number; placedQty: number }>();
  const beforeDone = new Map<string, number>();
  for (const s of input.orderSums) {
    const k = key(s.distributorId, s.productId);
    if (s.month === prev) {
      if (s.status === 'DONE') beforeDone.set(k, (beforeDone.get(k) ?? 0) + s.quantity);
      continue;
    }
    if (s.month !== month) continue;
    const cur = orders.get(k) ?? { doneQty: 0, donePaise: 0, placedQty: 0 };
    if (s.status === 'DONE') {
      cur.doneQty += s.quantity;
      cur.donePaise += s.amountPaise;
    } else cur.placedQty += s.quantity;
    orders.set(k, cur);
  }
  const keys = new Set([...counts.keys(), ...orders.keys(), ...stated.keys()]);
  return [...keys].map((k) => {
    const [distributorId = '', productId = ''] = k.split('|');
    const o = orders.get(k) ?? { doneQty: 0, donePaise: 0, placedQty: 0 };
    const figure = stockFigure({ orderQty: o.doneQty, count: countFigure(counts.get(k)), statement: statementFigure(stated.get(k)) });
    const last = stockFigure({ orderQty: beforeDone.get(k) ?? 0, count: countFigure(beforeCounts.get(k)), statement: statementFigure(beforeStated.get(k)) });
    const flags: SalesRowFlag[] = [];
    if (figure.source === 'NONE') flags.push('NO_COUNT');
    flags.push(...figure.flags);
    let secPaise: number | null = null;
    if (figure.secondaryQty !== null && figure.secondaryQty >= 0) {
      secPaise = valueOf(figure.secondaryQty, input.ptr.get(productId));
      if (secPaise === null) flags.push('UNPRICED');
    }
    if (figure.openingQty !== null && last.closingQty !== null && last.closingQty !== figure.openingQty) flags.push('OPENING_MISMATCH');
    const adjustmentPaise = figure.adjustmentQty === 0 ? 0 : valueOf(figure.adjustmentQty, input.pts?.get(productId));
    return {
      distributorId,
      productId,
      openingQty: figure.openingQty,
      orderPrimaryQty: o.doneQty,
      adjustmentQty: figure.adjustmentQty,
      primaryQty: figure.primaryQty,
      primaryPaise: o.donePaise + (adjustmentPaise ?? 0),
      placedQty: o.placedQty,
      closingQty: figure.closingQty,
      secondaryQty: figure.secondaryQty,
      secondaryPaise: secPaise,
      source: figure.source,
      flags,
    };
  });
}
