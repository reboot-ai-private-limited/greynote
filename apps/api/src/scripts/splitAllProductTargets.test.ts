import { describe, expect, it } from 'vitest';
import { planEqualSplit, type LegacyTarget } from './splitAllProductTargets.js';

const old = (id: string, userId: string, amountPaise: number, month = '2026-10', toMonth = '2027-03'): LegacyTarget => ({ id, userId, month, toMonth, amountPaise, createdBy: 'admin' });
const products = [{ id: 'c', ptsPaise: 1000 }, { id: 'a', ptsPaise: 500 }, { id: 'b', ptsPaise: 2000 }];

describe('planEqualSplit', () => {
  it('divides an old target equally across the products and removes it; the shares add up to it exactly', () => {
    const plan = planEqualSplit({ legacy: [old('o1', 'mr1', 1_000_000)], products, existing: [], skipUsers: new Set() });
    expect(plan.inserts.map((i) => [i.productId, i.amountPaise])).toEqual([['a', 333_334], ['b', 333_333], ['c', 333_333]]);
    expect(plan.inserts.reduce((n, i) => n + i.amountPaise, 0)).toBe(1_000_000);
    expect(plan.removeIds).toEqual(['o1']);
    expect(plan.inserts.every((i) => i.userId === 'mr1' && i.month === '2026-10' && i.toMonth === '2027-03' && i.createdBy === 'admin')).toBe(true);
  });

  it('gives units at each product’s PTS', () => {
    const plan = planEqualSplit({ legacy: [old('o1', 'mr1', 900_000)], products, existing: [], skipUsers: new Set() });
    expect(plan.inserts.map((i) => [i.productId, i.qty])).toEqual([['a', 600], ['b', 150], ['c', 300]]);
  });

  it('adds the share to a product target the person already has over exactly those months instead of clashing', () => {
    const plan = planEqualSplit({ legacy: [old('o1', 'mr1', 300_000)], products, existing: [{ id: 'e1', userId: 'mr1', month: '2026-10', toMonth: '2027-03', productId: 'b', amountPaise: 50_000 }], skipUsers: new Set() });
    expect(plan.adds).toEqual([{ id: 'e1', amountPaise: 150_000, qty: 75 }]);
    expect(plan.inserts.map((i) => i.productId)).toEqual(['a', 'c']);
    // Nothing is lost: what existed plus the old total is what the person has after.
    const after = plan.inserts.reduce((n, i) => n + i.amountPaise, 0) + plan.adds.reduce((n, a) => n + a.amountPaise, 0);
    expect(after).toBe(300_000 + 50_000);
  });

  it('leaves managers and inactive people alone and says why', () => {
    const plan = planEqualSplit({ legacy: [old('o1', 'asm', 100), old('o2', 'mr1', 90_000)], products, existing: [], skipUsers: new Set(['asm']) });
    expect(plan.removeIds).toEqual(['o2']);
    expect(plan.skipped).toEqual([{ id: 'o1', reason: expect.stringContaining('not an active MR') }]);
  });

  it('changes nothing when there is no product to share across, or nothing old to split', () => {
    expect(planEqualSplit({ legacy: [old('o1', 'mr1', 100)], products: [], existing: [], skipUsers: new Set() })).toMatchObject({ inserts: [], removeIds: [], skipped: [{ id: 'o1' }] });
    expect(planEqualSplit({ legacy: [], products, existing: [], skipUsers: new Set() })).toEqual({ inserts: [], adds: [], removeIds: [], skipped: [] });
  });

  it('a total smaller than the number of products still adds up', () => {
    const plan = planEqualSplit({ legacy: [old('o1', 'mr1', 2)], products, existing: [], skipUsers: new Set() });
    expect(plan.inserts.map((i) => [i.productId, i.amountPaise])).toEqual([['a', 1], ['b', 1]]);
  });
});
