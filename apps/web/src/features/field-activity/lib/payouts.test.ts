import { describe, expect, it } from 'vitest';
import { payoutMonths, payoutState, payoutTotals } from './payouts';

const bucket = (ta = 0, da = 0, reimbursement = 0, count = 0) => ({ taPaise: ta, daPaise: da, reimbursementPaise: reimbursement, count });
const row = (unpaid = bucket(), paid = bucket()) => ({ userId: 'u', userName: 'n', employeeCode: 'E', unpaid, paid, lastPaidAt: null });

describe('payoutTotals', () => {
  it('counts employees owed and sums unpaid and paid across TA, DA and reimbursements', () => {
    const rows = [row(bucket(100, 200, 300, 3)), row(bucket(), bucket(10, 20, 30, 2)), row(bucket(5, 0, 0, 1), bucket(1, 1, 1, 1))];
    expect(payoutTotals(rows)).toEqual({ owed: 2, unpaidPaise: 605, paidPaise: 63 });
    expect(payoutTotals([])).toEqual({ owed: 0, unpaidPaise: 0, paidPaise: 0 });
  });
});

describe('payoutState', () => {
  it('is paid with nothing owed, partly with some of each, unpaid otherwise', () => {
    expect(payoutState(row(bucket(), bucket(1, 0, 0, 1)))).toBe('paid');
    expect(payoutState(row(bucket(1, 0, 0, 1), bucket(1, 0, 0, 1)))).toBe('partly');
    expect(payoutState(row(bucket(1, 0, 0, 1)))).toBe('unpaid');
  });
});

describe('payoutMonths', () => {
  it('runs from the financial year start to the current month, newest first, the current one included', () => {
    expect(payoutMonths('2026-04-01', '2026-10-06')).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
  });
  it('a past year gives all twelve, a future one none', () => {
    expect(payoutMonths('2025-04-01', '2026-10-06')).toHaveLength(12);
    expect(payoutMonths('2027-04-01', '2026-10-06')).toEqual([]);
  });
  it('crosses the calendar year', () => {
    expect(payoutMonths('2026-04-01', '2027-02-10').slice(0, 2)).toEqual(['2027-02', '2027-01']);
  });
});
