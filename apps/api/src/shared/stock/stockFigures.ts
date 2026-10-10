/**
 * One distributor's one product in one month, from whatever was entered (decision-log 2026-10-09). Opening + Primary − Secondary = Closing, so
 * any one follows from the other three. There are two ways to know the month: the **field count** (a field worker's opening and closing; secondary
 * is derived) and the **Admin statement** (opening, the secondary the distributor reported and an adjustment to primary; closing is derived). When a
 * statement states a secondary it is the figure used; the field count then only raises `COUNT_MISMATCH`. Primary is the month's Done orders plus the
 * statement's adjustment.
 */
export interface CountFigure {
  openingQty: number;
  closingQty: number;
}

export interface StatementFigure {
  openingQty: number;
  /** `null` while Admin has entered only an adjustment. */
  secondaryQty: number | null;
  /** Supply without an app order (+) or a return (−). */
  adjustmentQty: number;
}

export type StockSource = 'STATEMENT' | 'FIELD_COUNT' | 'NONE';
export type StockFigureFlag = 'NEGATIVE_SECONDARY' | 'NEGATIVE_CLOSING' | 'COUNT_MISMATCH';

export interface StockFigure {
  source: StockSource;
  openingQty: number | null;
  /** Done orders in the month. */
  orderPrimaryQty: number;
  adjustmentQty: number;
  /** Orders + adjustment. */
  primaryQty: number;
  secondaryQty: number | null;
  closingQty: number | null;
  /** The field worker's closing count, when there is one — shown beside a statement so a difference is visible. */
  countClosingQty: number | null;
  flags: StockFigureFlag[];
}

export function stockFigure(input: { orderQty: number; count?: CountFigure | undefined; statement?: StatementFigure | undefined }): StockFigure {
  const { count, statement } = input;
  const adjustmentQty = statement?.adjustmentQty ?? 0;
  const primaryQty = input.orderQty + adjustmentQty;
  const base = { orderPrimaryQty: input.orderQty, adjustmentQty, primaryQty, countClosingQty: count?.closingQty ?? null };
  const opening = statement ? statement.openingQty : (count?.openingQty ?? null);

  if (statement && statement.secondaryQty !== null) {
    const closing = statement.openingQty + primaryQty - statement.secondaryQty;
    const flags: StockFigureFlag[] = [];
    if (closing < 0) flags.push('NEGATIVE_CLOSING');
    if (count && count.closingQty !== closing) flags.push('COUNT_MISMATCH');
    return { ...base, source: 'STATEMENT', openingQty: opening, secondaryQty: statement.secondaryQty, closingQty: closing, flags };
  }
  if (count && opening !== null) {
    const secondary = opening + primaryQty - count.closingQty;
    return { ...base, source: 'FIELD_COUNT', openingQty: opening, secondaryQty: secondary, closingQty: count.closingQty, flags: secondary < 0 ? ['NEGATIVE_SECONDARY'] : [] };
  }
  return { ...base, source: 'NONE', openingQty: opening, secondaryQty: null, closingQty: null, flags: [] };
}

/** The month before a `YYYY-MM`. */
export const previousMonthOf = (month: string): string => {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
