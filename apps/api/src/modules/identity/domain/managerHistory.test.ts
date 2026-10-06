import { describe, expect, it } from 'vitest';
import { managerAsOf, type ManagerChange } from './managerHistory.js';

const change = (effectiveFrom: string, managerId: string | null, previousManagerId: string | null, at = 0): ManagerChange => ({
  id: `c${effectiveFrom}${at}`,
  userId: 'u',
  managerId,
  previousManagerId,
  effectiveFrom,
  source: 'PROFILE_EDIT',
  promotionId: null,
  createdBy: null,
  createdAt: new Date(at),
});

describe('managerAsOf', () => {
  it('is the current manager when nothing was recorded', () => {
    expect(managerAsOf([], 'm1', '2026-01')).toBe('m1');
  });

  it('uses the change in force for the month, and who it was before the first change', () => {
    const history = [change('2026-11', 'sam', 'raj'), change('2027-03', 'lee', 'sam')];
    expect(managerAsOf(history, 'lee', '2026-10')).toBe('raj');
    expect(managerAsOf(history, 'lee', '2026-11')).toBe('sam');
    expect(managerAsOf(history, 'lee', '2027-02')).toBe('sam');
    expect(managerAsOf(history, 'lee', '2027-03')).toBe('lee');
  });

  it('two changes in one month: the one saved last wins; a cleared manager reads as null', () => {
    const history = [change('2026-11', 'a', null, 1), change('2026-11', 'b', 'a', 2), change('2026-12', null, 'b')];
    expect(managerAsOf(history, null, '2026-11')).toBe('b');
    expect(managerAsOf(history, null, '2026-12')).toBeNull();
    expect(managerAsOf(history, null, '2026-10')).toBeNull();
  });
});
