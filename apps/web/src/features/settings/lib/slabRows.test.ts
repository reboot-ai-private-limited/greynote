import { describe, expect, it } from 'vitest';
import { draftFromRows, rowsFromDraft, summariseSlabs } from './slabRows';

const PTAX = '[{"from":10000,"to":14999,"amount":110},{"from":15000,"to":19999,"amount":130},{"from":20000,"to":null,"amount":150}]';

describe('slab rows', () => {
  it('shows a stored table as rows of where each starts and what it costs', () => {
    expect(rowsFromDraft(PTAX)).toEqual([
      { from: '10000', amount: '110' },
      { from: '15000', amount: '130' },
      { from: '20000', amount: '150' },
    ]);
  });

  it('writes the same table back: each slab ends right before the next, the last has no end', () => {
    expect(draftFromRows(rowsFromDraft(PTAX))).toBe(PTAX);
  });

  it('keeps a half-typed value as typed, for the server rule to name', () => {
    expect(draftFromRows([{ from: '10000', amount: '11x' }, { from: '', amount: '130' }])).toBe('[{"from":10000,"to":"","amount":"11x"},{"from":"","to":null,"amount":130}]');
  });

  it('shows nothing for a draft it cannot read', () => {
    expect(rowsFromDraft('nope')).toEqual([]);
    expect(rowsFromDraft('{}')).toEqual([]);
  });

  it('summarises for the settings list', () => {
    expect(summariseSlabs(PTAX)).toBe('₹10,000 to ₹14,999: ₹110 · ₹15,000 to ₹19,999: ₹130 · ₹20,000 and above: ₹150');
  });
});
