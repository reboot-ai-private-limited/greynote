/** What an employee can ask for: samples of a product (a quantity to give out), or LBL — the product's page left with a doctor. */
export const SAMPLE_REQUEST_KINDS = ['SAMPLE', 'LBL'] as const;
export type SampleRequestKind = (typeof SAMPLE_REQUEST_KINDS)[number];

export const SAMPLE_REQUEST_STATUSES = ['REQUESTED', 'DONE', 'CANCELLED'] as const;
export type SampleRequestStatus = (typeof SAMPLE_REQUEST_STATUSES)[number];

export interface SampleRequestLine {
  productId: string;
  /** What the employee asked for (copies of LBL, units of a sample). */
  quantity: number;
  /** What Admin, Accounts or HR credited when marking it done; `null` until then. */
  creditedQuantity: number | null;
}

/**
 * An employee's request for samples or LBL (2026-11). No approval: Admin, Accounts or HR mark it **done**, which credits the employee with each
 * line's `creditedQuantity` (the requested quantity unless the marker changed it). What the employee has *given* comes from their doctor calls, so
 * "left" is credited minus given and is never stored.
 */
export interface SampleRequest {
  id: string;
  userId: string;
  kind: SampleRequestKind;
  lines: SampleRequestLine[];
  remarks: string | null;
  status: SampleRequestStatus;
  requestedAt: Date;
  doneBy: string | null;
  doneAt: Date | null;
}

/** One product row of an employee's account: asked for, credited, given out, and what is left (it can be below zero: nothing stops a call). */
export interface SampleBalanceRow {
  productId: string;
  productName: string;
  requested: number;
  credited: number;
  given: number;
  left: number;
}

/** The employee's account, for samples and for LBL. Pure so the phone, web and tests agree. */
export function buildBalance(
  requests: readonly SampleRequest[],
  given: { samples: ReadonlyArray<{ productId: string; quantity: number }>; lbl: ReadonlyArray<{ productId: string; quantity: number }> },
  nameOf: (productId: string) => string,
): { samples: SampleBalanceRow[]; lbl: SampleBalanceRow[] } {
  const build = (kind: SampleRequestKind, givenLines: ReadonlyArray<{ productId: string; quantity: number }>): SampleBalanceRow[] => {
    const rows = new Map<string, { requested: number; credited: number; given: number }>();
    const row = (id: string) => rows.get(id) ?? rows.set(id, { requested: 0, credited: 0, given: 0 }).get(id)!;
    for (const r of requests) {
      if (r.kind !== kind || r.status === 'CANCELLED') continue;
      for (const l of r.lines) {
        row(l.productId).requested += l.quantity;
        if (r.status === 'DONE') row(l.productId).credited += l.creditedQuantity ?? l.quantity;
      }
    }
    for (const g of givenLines) row(g.productId).given += g.quantity;
    return [...rows].map(([productId, v]) => ({ productId, productName: nameOf(productId), ...v, left: v.credited - v.given })).sort((a, b) => a.productName.localeCompare(b.productName));
  };
  return { samples: build('SAMPLE', given.samples), lbl: build('LBL', given.lbl) };
}
