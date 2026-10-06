import type { ExpenseBucketDto, ExpensePayoutRowDto } from '@greynote/contracts';

export const bucketPaise = (b: ExpenseBucketDto): number => b.taPaise + b.daPaise + b.reimbursementPaise;

export interface PayoutTotals {
  /** Employees with something unpaid. */
  owed: number;
  unpaidPaise: number;
  paidPaise: number;
}

export function payoutTotals(rows: readonly ExpensePayoutRowDto[]): PayoutTotals {
  const t: PayoutTotals = { owed: 0, unpaidPaise: 0, paidPaise: 0 };
  for (const r of rows) {
    if (r.unpaid.count > 0) t.owed += 1;
    t.unpaidPaise += bucketPaise(r.unpaid);
    t.paidPaise += bucketPaise(r.paid);
  }
  return t;
}

export type PayoutState = 'unpaid' | 'paid' | 'partly';

/** Nothing owed is paid; something owed and something paid is partly (an expense paid one by one before the payout). */
export function payoutState(r: Pick<ExpensePayoutRowDto, 'unpaid' | 'paid'>): PayoutState {
  if (r.unpaid.count === 0) return 'paid';
  return r.paid.count > 0 ? 'partly' : 'unpaid';
}

/**
 * The months worth paying in a financial year: those from its start to the current month (the current one can be paid early),
 * newest first. `year` is the financial year's starting calendar year and `startMonth` 1-12.
 */
export function payoutMonths(fyFrom: string, today: string): string[] {
  const current = today.slice(0, 7);
  const out: string[] = [];
  let [y = 0, m = 1] = fyFrom.slice(0, 7).split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month <= current) out.push(month);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}
