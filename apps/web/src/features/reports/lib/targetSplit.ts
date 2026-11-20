import type { SetTargetsBulkBody, TargetLineBody } from '@/lib/api/endpoints/marketing';

/** A percentage is kept in hundredths of a percent (25.5 % → 2550) so that adding them never drifts: 100 % is 10000. */
export const FULL = 10_000;

/** "25", "12.5", "12.55" → hundredths of a percent; blank is 0; anything else (negative, 3 decimals, text) is null. */
export function parsePercent(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [whole = '0', fraction = ''] = t.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Hundredths of a percent as the text to show: 2550 → "25.5", 2500 → "25". */
export const percentText = (bp: number): string => String(bp / 100);

export interface SplitState {
  /** Allotted so far, in hundredths of a percent. */
  sum: number;
  /** 100 % minus what is allotted (negative when over). */
  remaining: number;
  over: boolean;
  /** Over by this much (0 when not over). */
  overBy: number;
  /** The box to blame when over: the one edited last, or if that one is blank, the largest. */
  blame: string | null;
  /** True only when every box parses and the total is exactly 100 %. */
  complete: boolean;
}

/**
 * Where a percentage split stands. `boxes` are the typed texts by product; `lastEdited` is the box the person touched last, which gets the
 * red border when the total passes 100 % (it is the one that caused it).
 */
export function splitState(boxes: Readonly<Record<string, string>>, lastEdited: string | null): SplitState {
  let sum = 0;
  let invalid = false;
  let largest: string | null = null;
  let largestBp = 0;
  for (const [id, text] of Object.entries(boxes)) {
    const bp = parsePercent(text);
    if (bp === null) {
      invalid = true;
      continue;
    }
    sum += bp;
    if (bp > largestBp) {
      largestBp = bp;
      largest = id;
    }
  }
  const over = sum > FULL;
  const lastBp = lastEdited ? (parsePercent(boxes[lastEdited] ?? '') ?? 0) : 0;
  return { sum, remaining: FULL - sum, over, overBy: over ? sum - FULL : 0, blame: over ? (lastBp > 0 ? lastEdited : largest) : null, complete: !invalid && sum === FULL };
}

/** The most a box can hold without the total passing 100 %, in hundredths of a percent. */
export function maxFor(boxes: Readonly<Record<string, string>>, id: string): number {
  const others = Object.entries(boxes).reduce((n, [key, text]) => (key === id ? n : n + (parsePercent(text) ?? 0)), 0);
  return Math.max(0, FULL - others);
}

/**
 * A total in paise split by percentage into whole paise that add up exactly to it: each product gets the floor of its share and the
 * paise left over go, one each, to those with the largest fractions (the earlier one first on a tie). Only meaningful when the
 * percentages add up to 100 %; products at 0 get nothing.
 */
export function splitAmount(totalPaise: number, shares: readonly { id: string; bp: number }[]): { id: string; paise: number }[] {
  const exact = shares.map((s) => ({ id: s.id, floor: Math.floor((totalPaise * s.bp) / FULL), fraction: (totalPaise * s.bp) % FULL, bp: s.bp }));
  let left = totalPaise - exact.reduce((n, e) => n + e.floor, 0);
  const order = exact.map((e, i) => ({ i, fraction: e.fraction })).filter((e) => e.fraction > 0).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const extra = new Map<number, number>();
  for (const { i } of order) {
    if (left <= 0) break;
    extra.set(i, 1);
    left -= 1;
  }
  return exact.filter((e) => e.bp > 0).map((e) => ({ id: e.id, paise: e.floor + (extra.get(exact.indexOf(e)) ?? 0) }));
}

/** The bulk-set body from a total and the typed percentages (products left at 0 are left out). */
export function splitBody(userId: string, range: { from: string; to: string }, totalPaise: number, boxes: Readonly<Record<string, string>>): SetTargetsBulkBody {
  return { userId, month: range.from, toMonth: range.to, items: splitItems(totalPaise, boxes) };
}

/** Product lines for a split: the same amounts a bulk set or an old target's split takes. */
export function splitItems(totalPaise: number, boxes: Readonly<Record<string, string>>): TargetLineBody[] {
  const shares = Object.entries(boxes).map(([id, text]) => ({ id, bp: parsePercent(text) ?? 0 }));
  return splitAmount(totalPaise, shares).map((s) => ({ productId: s.id, targetAmountPaise: s.paise }));
}
