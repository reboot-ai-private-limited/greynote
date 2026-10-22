import { describe, expect, it } from 'vitest';
import type { Target } from '../domain/marketing.entities.js';
import { LeaverTargets } from './leaverTargets.js';

const t = (id: string, month: string, toMonth: string, amount: number, qty: number | null = null): Target =>
  ({ id, userId: 'mr1', month, toMonth, productId: null, campaignId: null, targetAmountPaise: amount, targetQty: qty, createdBy: 'a', createdAt: new Date(), updatedAt: new Date() });

function repo(rows: Target[]) {
  return {
    rows,
    listOverlapping: async (_ids: string[], from: string, to: string) => rows.filter((r) => r.month <= to && r.toMonth >= from),
    update: async (id: string, key: { toMonth: string }, amount: number, qty: number | null) => {
      const r = rows.find((x) => x.id === id)!;
      Object.assign(r, { toMonth: key.toMonth, targetAmountPaise: amount, targetQty: qty });
      return r;
    },
    remove: async (id: string) => {
      const i = rows.findIndex((x) => x.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

describe('a leaver’s targets', () => {
  it('cuts a run at the leaving month keeping its share, removes later ones, leaves earlier ones', async () => {
    const r = repo([t('quarter', '2026-10', '2026-12', 300_000, 30), t('later', '2026-11', '2026-11', 50_000), t('done', '2026-09', '2026-09', 10_000)]);
    const leaver = new LeaverTargets(r as never);
    expect(await leaver.count('mr1', '2026-10-15')).toBe(2);
    expect(await leaver.cut('mr1', '2026-10-15', 'admin')).toEqual({ cut: 1, removed: 1 });
    expect(r.rows.map((x) => [x.id, x.month, x.toMonth, x.targetAmountPaise, x.targetQty])).toEqual([
      ['quarter', '2026-10', '2026-10', 100_000, 10],
      ['done', '2026-09', '2026-09', 10_000, null],
    ]);
    expect(await leaver.cut('mr1', '2026-10-15', 'admin')).toEqual({ cut: 0, removed: 0 });
  });
});
