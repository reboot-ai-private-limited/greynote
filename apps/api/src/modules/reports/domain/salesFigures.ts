import type { SalesMonthDto, SalesRowFlag, SalesStatementRowDto } from '@greynote/contracts';

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
 * The twelve points of the Sales chart. Primary is every Done order to a distributor in the month it was marked Done. Secondary is worked out
 * from the distributors' own counts, so it exists only for what was counted, and a count whose secondary comes out negative is left out of the
 * totals and counted as an error. A month still in progress has its primary and no secondary (stock is counted after the month ends); a future
 * month has nothing.
 */
export function buildSalesMonths(input: {
  months: readonly string[];
  currentMonth: string;
  orderSums: readonly OrderSum[];
  stock: readonly StockCount[];
  /** Product id → PTR in paise, `null` when the card has none. */
  ptr: ReadonlyMap<string, number | null>;
  /** Ids of the active distributors, for the completeness of each month. */
  expectedDistributorIds: readonly string[];
}): SalesMonthDto[] {
  const done = doneByKey(input.orderSums);
  const expected = new Set(input.expectedDistributorIds);
  return input.months.map((month): SalesMonthDto => {
    const state = month > input.currentMonth ? 'FUTURE' : month === input.currentMonth ? 'OPEN' : 'ENDED';
    const blank: SalesMonthDto = { month, state, primaryQty: 0, primaryPaise: 0, placedQty: 0, placedPaise: 0, secondaryQty: null, secondaryPaise: null, countedDistributors: 0, expectedDistributors: expected.size, complete: false, negativeRows: 0, unpricedRows: 0 };
    if (state === 'FUTURE') return blank;

    let primaryQty = 0;
    let primaryPaise = 0;
    let placedQty = 0;
    let placedPaise = 0;
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

    const counts = input.stock.filter((c) => c.month === month);
    const counted = new Set(counts.filter((c) => expected.has(c.distributorId)).map((c) => c.distributorId));
    let secQty = 0;
    let secPaise = 0;
    let negativeRows = 0;
    let unpricedRows = 0;
    for (const c of counts) {
      const sec = secondaryQty(c.openingQty, done.get(key(month, c.distributorId, c.productId))?.qty ?? 0, c.closingQty);
      if (sec < 0) {
        negativeRows += 1;
        continue;
      }
      secQty += sec;
      const value = valueOf(sec, input.ptr.get(c.productId));
      if (value === null) unpricedRows += 1;
      else secPaise += value;
    }
    const hasSecondary = counts.length > 0;
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
 * One month's statement: a row for each distributor and product that has a count or an order that month. A row with orders but no count has
 * no opening, closing or secondary and says so; one whose opening is not what the same distributor closed the month before with is flagged.
 */
export function buildStatement(input: {
  month: string;
  orderSums: readonly OrderSum[];
  /** The month's counts and the previous month's (for the opening check). */
  stock: readonly StockCount[];
  ptr: ReadonlyMap<string, number | null>;
}): Array<Omit<SalesStatementRowDto, 'distributor' | 'product'> & { distributorId: string; productId: string }> {
  const { month } = input;
  const prev = previousMonth(month);
  const counts = new Map(input.stock.filter((c) => c.month === month).map((c) => [key(c.distributorId, c.productId), c]));
  const before = new Map(input.stock.filter((c) => c.month === prev).map((c) => [key(c.distributorId, c.productId), c]));
  const orders = new Map<string, { doneQty: number; donePaise: number; placedQty: number }>();
  for (const s of input.orderSums) {
    if (s.month !== month) continue;
    const k = key(s.distributorId, s.productId);
    const cur = orders.get(k) ?? { doneQty: 0, donePaise: 0, placedQty: 0 };
    if (s.status === 'DONE') {
      cur.doneQty += s.quantity;
      cur.donePaise += s.amountPaise;
    } else cur.placedQty += s.quantity;
    orders.set(k, cur);
  }
  const keys = new Set([...counts.keys(), ...orders.keys()]);
  return [...keys].map((k) => {
    const [distributorId = '', productId = ''] = k.split('|');
    const count = counts.get(k);
    const o = orders.get(k) ?? { doneQty: 0, donePaise: 0, placedQty: 0 };
    const flags: SalesRowFlag[] = [];
    let sec: number | null = null;
    let secPaise: number | null = null;
    if (!count) flags.push('NO_COUNT');
    else {
      sec = secondaryQty(count.openingQty, o.doneQty, count.closingQty);
      if (sec < 0) flags.push('NEGATIVE_SECONDARY');
      else {
        secPaise = valueOf(sec, input.ptr.get(productId));
        if (secPaise === null) flags.push('UNPRICED');
      }
      const last = before.get(k);
      if (last && last.closingQty !== count.openingQty) flags.push('OPENING_MISMATCH');
    }
    return { distributorId, productId, openingQty: count?.openingQty ?? null, primaryQty: o.doneQty, primaryPaise: o.donePaise, placedQty: o.placedQty, closingQty: count?.closingQty ?? null, secondaryQty: sec, secondaryPaise: secPaise, flags };
  });
}
