/**
 * Old targets for "all products" (a rupee amount with no product) cannot stay now that every target is for a product (decision-log 2026-11-20).
 * This plans how to turn each one into product targets by dividing it **equally** across the active products that have a PTS, in whole paise so
 * the products add up to the old amount exactly (the paise left over go to the first products in id order). Pure: reads rows, returns changes.
 */
export interface LegacyTarget {
  id: string;
  userId: string;
  month: string;
  toMonth: string;
  amountPaise: number;
  createdBy: string;
}

export interface ProductRow {
  id: string;
  ptsPaise: number;
}

export interface ExistingProductTarget {
  id: string;
  userId: string;
  month: string;
  toMonth: string;
  productId: string;
  amountPaise: number;
}

export interface PlannedInsert {
  userId: string;
  month: string;
  toMonth: string;
  productId: string;
  amountPaise: number;
  qty: number;
  createdBy: string;
}

export interface PlannedAdd {
  id: string;
  /** The amount the existing target will have after the share is added to it, and its units. */
  amountPaise: number;
  qty: number;
}

export interface SplitPlan {
  inserts: PlannedInsert[];
  /** An employee who already has a target for a product over exactly these months gets the share added to it (the key is unique). */
  adds: PlannedAdd[];
  /** The old all-products targets that are fully replaced. */
  removeIds: string[];
  skipped: { id: string; reason: string }[];
}

const units = (amountPaise: number, ptsPaise: number): number => Math.max(1, Math.round(amountPaise / ptsPaise));

/** `skipUsers` are people who cannot hold a target (managers, whose targets are ignored, or anyone no longer active): left as they are. */
export function planEqualSplit(input: { legacy: LegacyTarget[]; products: ProductRow[]; existing: ExistingProductTarget[]; skipUsers: ReadonlySet<string> }): SplitPlan {
  const products = [...input.products].sort((a, b) => a.id.localeCompare(b.id));
  const existing = new Map(input.existing.map((t) => [`${t.userId}|${t.month}|${t.toMonth}|${t.productId}`, t]));
  const plan: SplitPlan = { inserts: [], adds: [], removeIds: [], skipped: [] };
  for (const old of input.legacy) {
    if (input.skipUsers.has(old.userId)) {
      plan.skipped.push({ id: old.id, reason: 'not an active MR (managers’ own targets are not read)' });
      continue;
    }
    if (products.length === 0) {
      plan.skipped.push({ id: old.id, reason: 'no active product with a PTS to share it across' });
      continue;
    }
    const each = Math.floor(old.amountPaise / products.length);
    const extra = old.amountPaise - each * products.length;
    products.forEach((p, i) => {
      const share = each + (i < extra ? 1 : 0);
      if (share <= 0) return; // a total smaller than the number of products: the first ones get a paise, the rest nothing
      const found = existing.get(`${old.userId}|${old.month}|${old.toMonth}|${p.id}`);
      if (found) {
        const amountPaise = found.amountPaise + share;
        plan.adds.push({ id: found.id, amountPaise, qty: units(amountPaise, p.ptsPaise) });
        // Two old targets over the same months for one person cannot both exist (unique), but keep the running amount right anyway.
        existing.set(`${old.userId}|${old.month}|${old.toMonth}|${p.id}`, { ...found, amountPaise });
      } else {
        plan.inserts.push({ userId: old.userId, month: old.month, toMonth: old.toMonth, productId: p.id, amountPaise: share, qty: units(share, p.ptsPaise), createdBy: old.createdBy });
        existing.set(`${old.userId}|${old.month}|${old.toMonth}|${p.id}`, { id: `new:${plan.inserts.length}`, userId: old.userId, month: old.month, toMonth: old.toMonth, productId: p.id, amountPaise: share });
      }
    });
    plan.removeIds.push(old.id);
  }
  return plan;
}
