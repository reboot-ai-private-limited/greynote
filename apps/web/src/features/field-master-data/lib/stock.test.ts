import type { StatementLineDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildSave,
  draftOf,
  isDirty,
  isFilled,
  liveFigures,
  rowErrors,
  copyFieldCount,
  type StockDraft,
} from './stock';

const line = (over: Partial<StatementLineDto> = {}): StatementLineDto => ({
  product: { id: 'p1', name: 'XYZ-500', sku: 'XYZ' },
  saved: false,
  openingQty: null,
  openingSuggested: true,
  orderPrimaryQty: 40,
  adjustmentQty: 0,
  adjustmentReason: null,
  primaryQty: 40,
  secondaryQty: null,
  closingQty: null,
  count: null,
  source: 'NONE',
  flags: [],
  updatedBy: null,
  updatedAt: null,
  ...over,
});
const counted = {
  openingQty: 10,
  closingQty: 15,
  by: { id: 'mr1', name: 'Asha' },
  at: '2026-10-02T05:00:00.000Z',
};
const draft = (over: Partial<StockDraft> = {}): StockDraft => ({
  opening: '10',
  secondary: '',
  adjustment: '',
  reason: '',
  ...over,
});

describe('draftOf', () => {
  it('a saved statement shows its own secondary; a derived one is not a typed value', () => {
    expect(
      draftOf(
        line({
          saved: true,
          source: 'STATEMENT',
          openingQty: 10,
          secondaryQty: 30,
          adjustmentQty: 5,
          adjustmentReason: 'Direct',
        }),
      ),
    ).toEqual({ opening: '10', secondary: '30', adjustment: '5', reason: 'Direct' });
    expect(
      draftOf(line({ source: 'FIELD_COUNT', openingQty: 10, secondaryQty: 35, count: counted })),
    ).toEqual({ opening: '10', secondary: '', adjustment: '', reason: '' });
  });
});

describe('liveFigures', () => {
  it('a typed secondary gives the closing: opening + orders + adjustment − secondary', () => {
    expect(liveFigures(line(), draft({ secondary: '30', adjustment: '5', reason: 'x' }))).toEqual({
      primary: 45,
      secondary: 30,
      closing: 25,
    });
  });
  it('with no secondary typed, the field count gives the closing and the secondary follows', () => {
    expect(liveFigures(line({ count: counted }), draft())).toEqual({
      primary: 40,
      secondary: 35,
      closing: 15,
    });
  });
  it('nothing typed and no count gives neither; a bad number is ignored, not guessed', () => {
    expect(liveFigures(line(), draft())).toEqual({ primary: 40, secondary: null, closing: null });
    expect(liveFigures(line(), draft({ opening: 'abc', secondary: '3' }))).toEqual({
      primary: 40,
      secondary: null,
      closing: null,
    });
  });
});

describe('rowErrors', () => {
  it('an adjustment needs a reason and a whole number; a typed secondary needs an opening', () => {
    expect(rowErrors(line(), draft({ adjustment: '5' }))).toEqual({ reason: 'Say why.' });
    expect(rowErrors(line(), draft({ adjustment: '5', reason: 'Direct supply' }))).toEqual({});
    expect(rowErrors(line(), draft({ adjustment: '2.5', reason: 'x' }))).toMatchObject({
      adjustment: expect.any(String),
    });
    expect(rowErrors(line(), draft({ opening: '', secondary: '3' }))).toEqual({
      opening: 'Enter the opening.',
    });
  });
  it('an untouched row with only a suggested opening is fine', () => {
    expect(rowErrors(line(), draft())).toEqual({});
    expect(isFilled(line(), draft())).toBe(false);
  });
});

describe('copyFieldCount', () => {
  it('copies the count’s opening and works the secondary out, with the adjustment in primary', () => {
    expect(
      copyFieldCount(
        line({ count: counted }),
        draft({ opening: '', adjustment: '6', reason: 'x' }),
      ),
    ).toMatchObject({ opening: '10', secondary: '41' });
  });
  it('does not copy a negative secondary', () => {
    expect(
      copyFieldCount(
        line({ orderPrimaryQty: 0, count: { ...counted, openingQty: 0, closingQty: 9 } }),
        draft(),
      ),
    ).toMatchObject({ secondary: '' });
  });
  it('does nothing without a count', () => {
    const d = draft();
    expect(copyFieldCount(line(), d)).toBe(d);
  });
});

describe('buildSave', () => {
  const drafts = (...rows: Array<[string, StockDraft]>) => new Map(rows);
  it('sends only the filled rows that changed, with the reason only when there is an adjustment', () => {
    const lines = [
      line({ product: { id: 'p1', name: 'A', sku: 'A' } }),
      line({ product: { id: 'p2', name: 'B', sku: 'B' } }),
      line({ product: { id: 'p3', name: 'C', sku: 'C' } }),
    ];
    const body = buildSave(
      'd1',
      '2026-09',
      lines,
      drafts(
        ['p1', draft({ secondary: '30', adjustment: '5', reason: ' Direct ' })],
        ['p2', draft()],
        ['p3', draft({ secondary: '' })],
      ),
    );
    expect(body).toEqual({
      distributorId: 'd1',
      month: '2026-09',
      lines: [
        { productId: 'p1', openingQty: 10, secondaryQty: 30, adjustmentQty: 5, reason: 'Direct' },
      ],
    });
  });
  it('is null when nothing changed, and a saved row left as it was is not resent', () => {
    const saved = line({ saved: true, source: 'STATEMENT', openingQty: 10, secondaryQty: 30 });
    expect(buildSave('d1', '2026-09', [saved], drafts(['p1', draftOf(saved)]))).toBeNull();
    expect(isDirty(saved, draft({ secondary: '31' }))).toBe(true);
  });
});
