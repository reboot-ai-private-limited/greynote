import { describe, expect, it } from 'vitest';
import { buildMatrix, filterRows, groupByFrame, perMonth, type TargetLine } from './targetTable';

const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const t = (id: string, product: string | null, from: string, to: string, amountPaise: number): TargetLine => ({ id, product: product ? { id: product, name: product.toUpperCase() } : null, fromMonth: from, toMonth: to, amountPaise, targetQty: null });

describe('perMonth', () => {
  it('spreads a target evenly over its own months and puts 0 elsewhere', () => {
    expect(perMonth(t('a', 'p', '2026-11', '2027-03', 1_200_000), months)).toEqual([0, 0, 0, 0, 0, 0, 0, 240_000, 240_000, 240_000, 240_000, 240_000]);
    expect(perMonth(t('a', 'p', '2026-04', '2026-04', 500), months)[0]).toBe(500);
  });
});

describe('perMonth adds up exactly', () => {
  it('gives the paise that do not divide evenly one each to the first months', () => {
    const m = perMonth(t('a', 'p', '2026-10', '2026-12', 1_157_143), months);
    expect(m.slice(6, 9)).toEqual([385_715, 385_714, 385_714]);
    expect(m.reduce((n, v) => n + v, 0)).toBe(1_157_143);
    for (const amount of [1, 2, 99, 405_000, 12_345_679]) expect(perMonth(t('a', 'p', '2026-04', '2027-03', amount), months).reduce((n, v) => n + v, 0)).toBe(amount);
  });
});

describe('buildMatrix', () => {
  it('adds up targets that overlap, per product and per month', () => {
    const m = buildMatrix([t('1', 'hp', '2026-04', '2027-03', 1_200_000), t('2', 'hp', '2026-11', '2026-11', 50_000), t('3', 'gut', '2026-10', '2026-12', 300_000)], months);
    const hp = m.rows.find((r) => r.key === 'hp')!;
    expect(hp.months[7]).toBe(100_000 + 50_000);
    expect(hp.total).toBe(1_200_000 + 50_000);
    expect(m.rows.map((r) => r.name)).toEqual(['GUT', 'HP']);
    expect(m.monthTotals[7]).toBe(100_000 + 50_000 + 100_000);
    expect(m.total).toBe(1_200_000 + 50_000 + 300_000);
  });
  it('keeps old all-products targets in a row of their own, last', () => {
    const m = buildMatrix([t('1', null, '2026-10', '2026-12', 300_000), t('2', 'zz', '2026-10', '2026-10', 100)], months);
    expect(m.rows.map((r) => [r.key, r.old])).toEqual([['zz', false], ['old', true]]);
  });
  it('keeps each product\'s targets with their own months, earliest first, for the sub-rows', () => {
    const m = buildMatrix([t('2', 'hp', '2026-11', '2026-11', 50_000), t('1', 'hp', '2026-04', '2027-03', 1_200_000)], months);
    const hp = m.rows[0]!;
    expect(hp.targets.map((x) => x.line.id)).toEqual(['1', '2']);
    expect(hp.targets[1]!.months[7]).toBe(50_000);
    expect(hp.months[7]).toBe(100_000 + 50_000);
  });
  it('is empty without targets', () => {
    expect(buildMatrix([], months)).toMatchObject({ rows: [], total: 0 });
  });
});

describe('filterRows', () => {
  const rows = buildMatrix([t('1', 'needpro hp', '2026-10', '2026-10', 10), t('2', 'zymegut', '2026-10', '2026-10', 10), t('3', null, '2026-10', '2026-10', 10)], months).rows;
  it('narrows by name in any case and always keeps an old not-split row', () => {
    expect(filterRows(rows, 'NEED').map((r) => r.key)).toEqual(['needpro hp', 'old']);
    expect(filterRows(rows, '  ').map((r) => r.key)).toEqual(['needpro hp', 'zymegut', 'old']);
    expect(filterRows(rows, 'nothing').map((r) => r.key)).toEqual(['old']);
  });
});

describe('groupByFrame', () => {
  it('groups by the months covered, earliest first, with totals and the old targets apart', () => {
    const g = groupByFrame([t('1', 'b', '2026-11', '2027-03', 500), t('2', 'a', '2026-11', '2027-03', 300), t('3', 'a', '2026-04', '2027-03', 1000), t('4', null, '2026-11', '2027-03', 700)]);
    expect(g.map((x) => [x.key, x.totalPaise, x.items.map((i) => i.id), x.old.map((i) => i.id)])).toEqual([
      ['2026-04|2027-03', 1000, ['3'], []],
      ['2026-11|2027-03', 1500, ['2', '1'], ['4']],
    ]);
  });
});
