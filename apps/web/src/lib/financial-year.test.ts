import { describe, expect, it } from 'vitest';
import { financialYearLabel, financialYearOf, financialYearRange } from './financial-year';

describe('financialYearOf', () => {
  it('starts on 1 April: 31 March is still the old year, 1 April is the new', () => {
    expect(financialYearOf('2027-03-31')).toBe(2026);
    expect(financialYearOf('2027-04-01')).toBe(2027);
    expect(financialYearOf('2026-10-03')).toBe(2026);
    expect(financialYearOf('2027-01-15')).toBe(2026);
  });
  it('follows another start month', () => {
    expect(financialYearOf('2026-12-31', 1)).toBe(2026);
    expect(financialYearOf('2026-09-30', 10)).toBe(2025);
    expect(financialYearOf('2026-10-01', 10)).toBe(2026);
  });
});

describe('financialYearRange', () => {
  it('runs from 1 April to 31 March', () => {
    expect(financialYearRange(2026)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });
  it('handles a January start, a leap year and an October start', () => {
    expect(financialYearRange(2027, 1)).toEqual({ from: '2027-01-01', to: '2027-12-31' });
    expect(financialYearRange(2027, 3)).toEqual({ from: '2027-03-01', to: '2028-02-29' });
    expect(financialYearRange(2026, 10)).toEqual({ from: '2026-10-01', to: '2027-09-30' });
  });
  it('is exactly the year financialYearOf names', () => {
    const { from, to } = financialYearRange(2026);
    expect(financialYearOf(from)).toBe(2026);
    expect(financialYearOf(to)).toBe(2026);
  });
});

describe('financialYearLabel', () => {
  it('shortens the second year', () => {
    expect(financialYearLabel(2026)).toBe('2026–27');
    expect(financialYearLabel(2099)).toBe('2099–00');
  });
});
