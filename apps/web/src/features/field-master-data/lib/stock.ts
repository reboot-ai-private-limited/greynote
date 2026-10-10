import type {
  SaveDistributorStatementDto,
  SaveStatementLineDto,
  StatementFlag,
  StatementLineDto,
} from '@greynote/contracts';

/** What a row of the Stock tab holds while it is being edited: the three typed values and the reason, as the person typed them. */
export interface StockDraft {
  opening: string;
  secondary: string;
  adjustment: string;
  reason: string;
}

export const FLAG_LABEL: Record<StatementFlag, string> = {
  NEGATIVE_SECONDARY: 'Secondary below zero',
  NEGATIVE_CLOSING: 'Closing below zero',
  COUNT_MISMATCH: 'Field count differs',
  OPENING_MISMATCH: 'Opening ≠ last closing',
};

const WHOLE = /^-?\d+$/;
const UNSIGNED = /^\d+$/;

/** A whole number from what was typed, `null` when it is empty, `NaN` when it is not a whole number. */
const parse = (raw: string, signed: boolean): number | null => {
  const t = raw.trim();
  if (t === '') return null;
  return (signed ? WHOLE : UNSIGNED).test(t) ? Number(t) : Number.NaN;
};

/** The row as the server last had it. Only a saved statement's own secondary is a typed value; a derived one is not. */
export function draftOf(line: StatementLineDto): StockDraft {
  return {
    opening: line.openingQty === null ? '' : String(line.openingQty),
    secondary:
      line.saved && line.source === 'STATEMENT' && line.secondaryQty !== null
        ? String(line.secondaryQty)
        : '',
    adjustment: line.adjustmentQty === 0 ? '' : String(line.adjustmentQty),
    reason: line.adjustmentReason ?? '',
  };
}

/** Whether a row has something Admin entered: a saved line, a secondary, or an adjustment. A suggested opening alone is not an entry. */
export const isFilled = (line: StatementLineDto, d: StockDraft): boolean =>
  line.saved || d.secondary.trim() !== '' || (parse(d.adjustment, true) ?? 0) !== 0;

export const isDirty = (line: StatementLineDto, d: StockDraft): boolean => {
  const base = draftOf(line);
  return (
    base.opening !== d.opening.trim() ||
    base.secondary !== d.secondary.trim() ||
    base.adjustment !== d.adjustment.trim() ||
    base.reason !== d.reason.trim()
  );
};

export interface LiveFigures {
  primary: number;
  secondary: number | null;
  closing: number | null;
}

/**
 * The row's figures as they stand with the typed values: Opening + Primary − Secondary = Closing. With a secondary typed, closing follows from it;
 * with none, a field worker's count (if there is one) gives the closing and secondary follows. Nothing typed and no count gives neither.
 */
export function liveFigures(line: StatementLineDto, d: StockDraft): LiveFigures {
  const adjustment = parse(d.adjustment, true);
  const primary =
    line.orderPrimaryQty + (adjustment !== null && !Number.isNaN(adjustment) ? adjustment : 0);
  const opening = parse(d.opening, false);
  const secondary = parse(d.secondary, false);
  if (opening === null || Number.isNaN(opening)) return { primary, secondary: null, closing: null };
  if (secondary !== null && !Number.isNaN(secondary))
    return { primary, secondary, closing: opening + primary - secondary };
  if (line.count)
    return {
      primary,
      secondary: opening + primary - line.count.closingQty,
      closing: line.count.closingQty,
    };
  return { primary, secondary: null, closing: null };
}

/** What is wrong with a row's typed values, by field; empty when it is fine. */
export function rowErrors(line: StatementLineDto, d: StockDraft): Record<string, string> {
  const out: Record<string, string> = {};
  const opening = parse(d.opening, false);
  const secondary = parse(d.secondary, false);
  const adjustment = parse(d.adjustment, true);
  if (Number.isNaN(opening)) out['opening'] = 'Whole units.';
  if (Number.isNaN(secondary)) out['secondary'] = 'Whole units.';
  if (Number.isNaN(adjustment)) out['adjustment'] = 'A whole number; − for a return.';
  if (isFilled(line, d) && opening === null) out['opening'] = 'Enter the opening.';
  if ((adjustment ?? 0) !== 0 && !Number.isNaN(adjustment) && d.reason.trim() === '')
    out['reason'] = 'Say why.';
  return out;
}

/** "Use field count": the opening and the closing the field worker counted, and the secondary that follows from them. */
export function copyFieldCount(line: StatementLineDto, d: StockDraft): StockDraft {
  if (!line.count) return d;
  const adjustment = parse(d.adjustment, true);
  const primary =
    line.orderPrimaryQty + (adjustment !== null && !Number.isNaN(adjustment) ? adjustment : 0);
  const secondary = line.count.openingQty + primary - line.count.closingQty;
  // A count that would make the secondary negative is not copied as a secondary: that is the mismatch to look at, not to save.
  return {
    ...d,
    opening: String(line.count.openingQty),
    secondary: secondary >= 0 ? String(secondary) : '',
  };
}

/** The lines to send: every filled row that changed. `null` when nothing changed. A row with a problem stops the save (see `rowErrors`). */
export function buildSave(
  distributorId: string,
  month: string,
  lines: readonly StatementLineDto[],
  drafts: ReadonlyMap<string, StockDraft>,
): SaveDistributorStatementDto | null {
  const out: SaveStatementLineDto[] = [];
  for (const line of lines) {
    const d = drafts.get(line.product.id);
    if (!d || !isFilled(line, d) || !isDirty(line, d)) continue;
    const adjustment = parse(d.adjustment, true) ?? 0;
    out.push({
      productId: line.product.id,
      openingQty: parse(d.opening, false) ?? 0,
      secondaryQty: parse(d.secondary, false),
      adjustmentQty: adjustment,
      reason: adjustment === 0 ? null : d.reason.trim(),
    });
  }
  return out.length === 0 ? null : { distributorId, month, lines: out };
}
