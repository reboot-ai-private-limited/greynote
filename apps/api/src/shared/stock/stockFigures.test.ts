import { describe, expect, it } from 'vitest';
import { stockFigure } from './stockFigures.js';

describe('stockFigure', () => {
  it('a field count alone: secondary = opening + primary − closing, as before', () => {
    expect(stockFigure({ orderQty: 40, count: { openingQty: 10, closingQty: 15 } })).toMatchObject({ source: 'FIELD_COUNT', primaryQty: 40, secondaryQty: 35, closingQty: 15, flags: [] });
  });
  it('a field count that makes secondary negative is flagged', () => {
    expect(stockFigure({ orderQty: 0, count: { openingQty: 5, closingQty: 9 } })).toMatchObject({ secondaryQty: -4, flags: ['NEGATIVE_SECONDARY'] });
  });
  it('a statement with a secondary wins: closing is derived and the adjustment is added to the orders', () => {
    expect(stockFigure({ orderQty: 40, statement: { openingQty: 10, secondaryQty: 30, adjustmentQty: 5 } })).toMatchObject({
      source: 'STATEMENT',
      orderPrimaryQty: 40,
      adjustmentQty: 5,
      primaryQty: 45,
      secondaryQty: 30,
      closingQty: 25,
      flags: [],
    });
  });
  it('a return is a negative adjustment', () => {
    expect(stockFigure({ orderQty: 40, statement: { openingQty: 0, secondaryQty: 30, adjustmentQty: -4 } })).toMatchObject({ primaryQty: 36, closingQty: 6 });
  });
  it('a count that disagrees with the statement raises COUNT_MISMATCH and the statement still wins', () => {
    const f = stockFigure({ orderQty: 40, count: { openingQty: 10, closingQty: 99 }, statement: { openingQty: 10, secondaryQty: 30, adjustmentQty: 0 } });
    expect(f).toMatchObject({ source: 'STATEMENT', secondaryQty: 30, closingQty: 20, countClosingQty: 99, flags: ['COUNT_MISMATCH'] });
    expect(stockFigure({ orderQty: 40, count: { openingQty: 10, closingQty: 20 }, statement: { openingQty: 10, secondaryQty: 30, adjustmentQty: 0 } }).flags).toEqual([]);
  });
  it('a statement that sold more than there was gives a negative closing, flagged', () => {
    expect(stockFigure({ orderQty: 5, statement: { openingQty: 0, secondaryQty: 9, adjustmentQty: 0 } })).toMatchObject({ closingQty: -4, flags: ['NEGATIVE_CLOSING'] });
  });
  it('a statement with only an adjustment adds to primary and falls back to the field count for closing', () => {
    expect(stockFigure({ orderQty: 40, count: { openingQty: 10, closingQty: 15 }, statement: { openingQty: 10, secondaryQty: null, adjustmentQty: 6 } })).toMatchObject({ source: 'FIELD_COUNT', primaryQty: 46, secondaryQty: 41, closingQty: 15 });
  });
  it('nothing entered gives nothing, but the orders still show as primary', () => {
    expect(stockFigure({ orderQty: 12 })).toMatchObject({ source: 'NONE', primaryQty: 12, secondaryQty: null, closingQty: null, openingQty: null });
  });
});
