import { describe, expect, it } from 'vitest';
import { MAX_QUANTITY, adjustTotalError, assignableMrs, givenOut, issuePreview, issueQuantityError } from './samples';

describe('givenOut', () => {
  it('is what has been drawn down', () => {
    expect(givenOut({ quantityAllocated: 20, quantityRemaining: 12 })).toBe(8);
  });
});

describe('issueQuantityError', () => {
  it('accepts a whole number from 1 to 100,000', () => {
    expect(issueQuantityError('1')).toBeUndefined();
    expect(issueQuantityError(' 50 ')).toBeUndefined();
    expect(issueQuantityError(String(MAX_QUANTITY))).toBeUndefined();
  });
  it('refuses blank, zero, fractions, negatives, text and too many', () => {
    expect(issueQuantityError('')).toBe('Enter a quantity.');
    expect(issueQuantityError('0')).toBe('Issue at least 1.');
    expect(issueQuantityError('2.5')).toBe('Use a whole number.');
    expect(issueQuantityError('-3')).toBe('Use a whole number.');
    expect(issueQuantityError('ten')).toBe('Use a whole number.');
    expect(issueQuantityError(String(MAX_QUANTITY + 1))).toMatch(/at most 1,00,000/);
  });
});

describe('adjustTotalError', () => {
  it('allows the total to equal what has been given out, or to be zero when nothing was', () => {
    expect(adjustTotalError('8', 8)).toBeUndefined();
    expect(adjustTotalError('0', 0)).toBeUndefined();
  });
  it('refuses a total below what has been given out', () => {
    expect(adjustTotalError('7', 8)).toMatch(/8 have already been given out/);
  });
  it('refuses blank, fractions and over the ceiling', () => {
    expect(adjustTotalError('', 0)).toBe('Enter a total.');
    expect(adjustTotalError('1.5', 0)).toBe('Use a whole number.');
    expect(adjustTotalError(String(MAX_QUANTITY + 1), 0)).toMatch(/at most/);
  });
});

describe('issuePreview', () => {
  it('says it adds to an existing allocation, and the new total', () => {
    expect(issuePreview({ quantityAllocated: 20, quantityRemaining: 5 }, 10)).toBe('Adds 10 to the 20 already allocated, making 30.');
  });
  it('says it allocates for a first issue', () => {
    expect(issuePreview(undefined, 10)).toBe('10 will be allocated.');
  });
});

describe('assignableMrs', () => {
  const row = (userId: string, name: string, status: 'active' | 'inactive' = 'active') => ({
    userId,
    status,
    user: { id: userId, name, employeeCode: `E-${userId}` },
  });
  it('offers the active MRs on the route, sorted, without the current one or duplicates', () => {
    const result = assignableMrs([row('u2', 'Zoya'), row('u1', 'Asha'), row('u3', 'Bina'), row('u1', 'Asha'), row('u4', 'Gone', 'inactive')], 'u3');
    expect(result.map((m) => m.name)).toEqual(['Asha', 'Zoya']);
  });
  it('skips a row with no user, and offers everyone when nobody is responsible yet', () => {
    expect(assignableMrs([{ userId: 'u1', status: 'active' as const, user: null }], null)).toEqual([]);
    expect(assignableMrs([row('u1', 'Asha')], null)).toHaveLength(1);
  });
});
