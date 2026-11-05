import { describe, expect, it } from 'vitest';
import { periodMonths, rangeLabel } from './employeeSales';

const FY = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

describe('periods', () => {
  it('a month, the quarter of the financial year that holds it, or the whole year', () => {
    expect(periodMonths('month', '2026-10', FY)).toEqual({ from: '2026-10', to: '2026-10' });
    expect(periodMonths('quarter', '2026-10', FY)).toEqual({ from: '2026-10', to: '2026-12' });
    expect(periodMonths('quarter', '2026-05', FY)).toEqual({ from: '2026-04', to: '2026-06' });
    expect(periodMonths('year', '2026-10', FY)).toEqual({ from: '2026-04', to: '2027-03' });
    expect(periodMonths('month', '2030-01', FY)).toEqual({ from: '2026-04', to: '2026-04' });
  });
  it('labels one month or a run', () => {
    expect(rangeLabel('2026-10', '2026-10')).toBe('October 2026');
    expect(rangeLabel('2026-10', '2026-12')).toBe('October 2026 – December 2026');
  });
});
