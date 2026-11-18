/**
 * The Secondary Sales performance sheet (the Excel the company keeps): for one financial year, one sheet per MR and one roll-up per manager,
 * products down the side and, across, each month's target and secondary (units) with the quarters, halves and the year. This is its plain data;
 * `secondarySheetXlsx.ts` turns it into the file.
 */
export interface SheetRow {
  productId: string;
  name: string;
  sku: string;
  /** The net selling rate (the product's PTS) in paise; `null` = no PTS, so the product is counted in units and adds nothing to the rupees. */
  nsrPaise: number | null;
  /** Units per month of the year, in order (12). */
  tgt: number[];
  sec: number[];
  /** Secondary units of the same product in the previous financial year, for % GR.; `null` when there was nothing to compare with. */
  prevSec: number | null;
}

export interface SheetPerson {
  id: string;
  name: string;
  code: string;
  designation: string | null;
  /** `MR`: their own figures. `TEAM`: a manager, the sum of the MRs below them. */
  kind: 'MR' | 'TEAM';
  /** MRs behind the figures (1 for an MR). */
  members: number;
  rows: SheetRow[];
}

export interface SecondarySheetModel {
  /** The year the financial year starts in, and its first month (4 = April). */
  year: number;
  startMonth: number;
  /** "2026-27". */
  label: string;
  /** The twelve months, `YYYY-MM`, first month first. */
  months: string[];
  /** Whose workbook it is: "Whole company" or the manager's name. */
  scopeName: string;
  /** Roll-ups first (top of the hierarchy down), then MRs. */
  people: SheetPerson[];
  /** MRs in the scope, and how many of them have any approved secondary this year. */
  mrCount: number;
  mrsWithApproved: number;
}

/** "2026-27" for the year starting in 2026 (a calendar-year financial year, starting in January, is just "2026"). */
export const fyLabel = (year: number, startMonth: number): string => (startMonth === 1 ? String(year) : `${year}-${String((year + 1) % 100).padStart(2, '0')}`);

/** The same twelve months one financial year earlier. */
export const previousYearMonths = (months: readonly string[]): string[] => months.map((m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`);

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
export const yearTotal = (xs: readonly number[]): number => sum(xs);

/** A manager's rows: the MRs' rows added product by product (units), keeping the products any of them has. */
export function sumRows(groups: readonly (readonly SheetRow[])[]): SheetRow[] {
  const out = new Map<string, SheetRow>();
  for (const rows of groups) {
    for (const r of rows) {
      const into = out.get(r.productId);
      if (!into) {
        out.set(r.productId, { ...r, tgt: [...r.tgt], sec: [...r.sec] });
        continue;
      }
      into.tgt = into.tgt.map((v, i) => v + r.tgt[i]!);
      into.sec = into.sec.map((v, i) => v + r.sec[i]!);
      into.prevSec = into.prevSec === null && r.prevSec === null ? null : (into.prevSec ?? 0) + (r.prevSec ?? 0);
    }
  }
  return [...out.values()].sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

/** A target spread evenly over its months, rounded per month: the units it adds to each month of the year. Months outside the target get 0. */
export function monthlyUnits(target: { fromMonth: string; toMonth: string; qty: number | null }, months: readonly string[]): number[] {
  if (target.qty === null) return months.map(() => 0);
  const span = (Number(target.toMonth.slice(0, 4)) - Number(target.fromMonth.slice(0, 4))) * 12 + Number(target.toMonth.slice(5)) - Number(target.fromMonth.slice(5)) + 1;
  const each = Math.round(target.qty / Math.max(1, span));
  return months.map((m) => (m >= target.fromMonth && m <= target.toMonth ? each : 0));
}
