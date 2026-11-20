import { describe, expect, it } from 'vitest';
import { FULL, maxFor, parsePercent, percentText, splitAmount, splitBody, splitState } from './targetSplit';

describe('parsePercent', () => {
  it('reads whole and two-decimal percentages as hundredths, blank as 0, and nothing else', () => {
    expect(parsePercent('25')).toBe(2500);
    expect(parsePercent(' 12.5 ')).toBe(1250);
    expect(parsePercent('12.55')).toBe(1255);
    expect(parsePercent('')).toBe(0);
    for (const bad of ['-5', '1.234', 'abc', '1e2', '1000', '.5']) expect(parsePercent(bad)).toBeNull();
    expect(percentText(1250)).toBe('12.5');
  });
});

describe('splitState', () => {
  it('counts what is allotted and what remains, and is complete only at exactly 100 %', () => {
    expect(splitState({ a: '25', b: '20', c: '', d: '5' }, 'd')).toMatchObject({ sum: 5000, remaining: 5000, over: false, complete: false, blame: null });
    expect(splitState({ a: '25', b: '20', c: '5', d: '50' }, 'd')).toMatchObject({ sum: FULL, remaining: 0, over: false, complete: true });
  });
  it('adds decimals without drift', () => {
    expect(splitState({ a: '33.33', b: '33.33', c: '33.34' }, null).complete).toBe(true);
    expect(splitState({ a: '0.1', b: '0.2', c: '99.7' }, null).complete).toBe(true);
  });
  it('blames the box edited last when the total passes 100 %, else the largest', () => {
    expect(splitState({ a: '60', b: '30', c: '20' }, 'c')).toMatchObject({ over: true, overBy: 1000, blame: 'c', complete: false });
    expect(splitState({ a: '60', b: '50', c: '' }, 'c')).toMatchObject({ over: true, blame: 'a' });
  });
  it('is not complete while a box holds something unreadable', () => {
    expect(splitState({ a: '100', b: 'x' }, 'b').complete).toBe(false);
  });
  it('says the most a box can hold', () => {
    expect(maxFor({ a: '60', b: '30', c: '20' }, 'c')).toBe(1000);
    expect(maxFor({ a: '60' }, 'a')).toBe(FULL);
  });
});

describe('splitAmount', () => {
  it('adds up to the total exactly, giving leftover paise to the largest fractions', () => {
    const parts = splitAmount(100, [{ id: 'a', bp: 3333 }, { id: 'b', bp: 3333 }, { id: 'c', bp: 3334 }]);
    expect(parts.reduce((n, p) => n + p.paise, 0)).toBe(100);
    expect(parts).toEqual([{ id: 'a', paise: 33 }, { id: 'b', paise: 33 }, { id: 'c', paise: 34 }]);
  });
  it('leaves out products at 0 and handles a typical split', () => {
    expect(splitAmount(1_200_000_00, [{ id: 'p1', bp: 2500 }, { id: 'p2', bp: 2000 }, { id: 'p3', bp: 500 }, { id: 'p4', bp: 5000 }, { id: 'p5', bp: 0 }])).toEqual([
      { id: 'p1', paise: 30_000_000 },
      { id: 'p2', paise: 24_000_000 },
      { id: 'p3', paise: 6_000_000 },
      { id: 'p4', paise: 60_000_000 },
    ]);
  });
  it('never loses a paise on awkward totals', () => {
    for (const total of [1, 7, 99, 100_001, 38_100_000_00]) {
      const parts = splitAmount(total, [{ id: 'a', bp: 1234 }, { id: 'b', bp: 4321 }, { id: 'c', bp: 4445 }]);
      expect(parts.reduce((n, p) => n + p.paise, 0)).toBe(total);
    }
  });
});

describe('splitBody', () => {
  it('sends the months and one line per product with a share', () => {
    expect(splitBody('mr1', { from: '2026-11', to: '2027-03' }, 1_000_00, { a: '60', b: '40', c: '' })).toEqual({
      userId: 'mr1',
      month: '2026-11',
      toMonth: '2027-03',
      items: [{ productId: 'a', targetAmountPaise: 60_000 }, { productId: 'b', targetAmountPaise: 40_000 }],
    });
  });
});
