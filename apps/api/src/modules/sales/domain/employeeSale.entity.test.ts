import { describe, expect, it } from 'vitest';
import { monthSecondaryStatus } from './employeeSale.entity.js';

const line = (secondaryQty: number | null, secondaryStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED') => ({ secondaryQty, secondaryStatus });

describe('monthSecondaryStatus', () => {
  it('is NOT_ENTERED with no lines, or only lines that carry Admin’s primary change', () => {
    expect(monthSecondaryStatus([])).toBe('NOT_ENTERED');
    expect(monthSecondaryStatus([line(null, 'APPROVED')])).toBe('NOT_ENTERED');
  });

  it('is the status of the entered lines when they agree', () => {
    expect(monthSecondaryStatus([line(10, 'DRAFT'), line(5, 'DRAFT')])).toBe('DRAFT');
    expect(monthSecondaryStatus([line(10, 'APPROVED'), line(0, 'APPROVED')])).toBe('APPROVED');
  });

  it('lets the line that still needs somebody win: pending, then rejected, then draft', () => {
    expect(monthSecondaryStatus([line(1, 'APPROVED'), line(1, 'DRAFT'), line(1, 'PENDING')])).toBe('PENDING');
    expect(monthSecondaryStatus([line(1, 'APPROVED'), line(1, 'DRAFT'), line(1, 'REJECTED')])).toBe('REJECTED');
    expect(monthSecondaryStatus([line(1, 'APPROVED'), line(1, 'DRAFT')])).toBe('DRAFT');
  });

  it('ignores a line with no quantity when judging the rest', () => {
    expect(monthSecondaryStatus([line(null, 'DRAFT'), line(3, 'APPROVED')])).toBe('APPROVED');
  });
});
