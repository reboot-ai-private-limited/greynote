import type { ExpenseAuditRowDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_CAP,
  auditTotals,
  expensesCsv,
  expensesFilename,
  flaggedRows,
  isCapped,
  isPayable,
  markPaidMessage,
  markRowsPaid,
  payableRows,
  sumPaise,
} from './expenses';

const row = (over: Partial<ExpenseAuditRowDto> = {}): ExpenseAuditRowDto => ({
  id: 'e1',
  userId: 'u1',
  userName: 'Asha Rao',
  employeeCode: 'MR001',
  reportDate: '2026-10-03',
  type: 'TA',
  source: 'AUTO',
  amountPaise: 617_000,
  remarks: null,
  paymentStatus: 'UNPAID',
  distanceFlag: false,
  routeId: null,
  paidBy: null,
  paidAt: null,
  ...over,
});

describe('payable rows and totals', () => {
  const rows = [row({ id: 'a', amountPaise: 1000 }), row({ id: 'b', amountPaise: 2000, paymentStatus: 'PAID' }), row({ id: 'c', amountPaise: 4000, paymentStatus: 'CANCELLED' }), row({ id: 'd', amountPaise: 8000 })];
  it('can pay only an unpaid row', () => {
    expect(isPayable(rows[0]!)).toBe(true);
    expect(isPayable(rows[1]!)).toBe(false);
    expect(isPayable(rows[2]!)).toBe(false);
    expect(payableRows(rows).map((r) => r.id)).toEqual(['a', 'd']);
  });
  it('totals what is owed and what was paid, leaving out a cancelled row', () => {
    expect(auditTotals(rows)).toEqual({ unpaidPaise: 9000, paidPaise: 2000, unpaidCount: 2, paidCount: 1 });
    expect(auditTotals([])).toEqual({ unpaidPaise: 0, paidPaise: 0, unpaidCount: 0, paidCount: 0 });
  });
  it('sums any selection', () => {
    expect(sumPaise([rows[0]!, rows[3]!])).toBe(9000);
  });
});

describe('cap and flags', () => {
  it('says the list may be incomplete at 500 rows', () => {
    expect(isCapped(Array.from({ length: AUDIT_CAP }))).toBe(true);
    expect(isCapped(Array.from({ length: AUDIT_CAP - 1 }))).toBe(false);
  });
  it('finds the travel allowances whose distance was not calculated', () => {
    expect(flaggedRows([row(), row({ id: 'f', distanceFlag: true })]).map((r) => r.id)).toEqual(['f']);
  });
});

describe('markRowsPaid', () => {
  it('marks every row in order and reports them paid', async () => {
    const sent: string[] = [];
    const result = await markRowsPaid(async (id) => void sent.push(id), ['a', 'b', 'c']);
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ paid: ['a', 'b', 'c'], failed: [] });
  });
  it('keeps going after a refusal, and keeps its message', async () => {
    const result = await markRowsPaid(async (id) => {
      if (id === 'b') throw new Error('This expense was cancelled when its report was sent back, so there is nothing to pay.');
    }, ['a', 'b', 'c']);
    expect(result.paid).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ id: 'b', message: 'This expense was cancelled when its report was sent back, so there is nothing to pay.' }]);
  });
  it('does nothing for no rows', async () => {
    expect(await markRowsPaid(async () => undefined, [])).toEqual({ paid: [], failed: [] });
  });
  it('says how many were done, and that the rest are still unpaid', () => {
    expect(markPaidMessage({ paid: ['a', 'b'], failed: [] }, 2)).toBe('2 of 2 marked paid.');
    expect(markPaidMessage({ paid: ['a'], failed: [{ id: 'b', message: 'x' }] }, 2)).toBe('1 of 2 marked paid. 1 could not be: they are still unpaid.');
  });
});

describe('expensesCsv', () => {
  it('writes a header and a row per expense with plain-number rupees', () => {
    const csv = expensesCsv([row(), row({ id: 'm', type: 'MEAL', source: 'MANUAL', amountPaise: 15_050, paymentStatus: 'PAID', paidAt: '2026-10-05T04:30:00Z', remarks: 'Lunch, with client' })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Employee code,Employee,Report day,Type,Source,Amount (INR),Status,Paid on,Remarks,Distance not calculated');
    expect(lines[1]).toBe('MR001,Asha Rao,2026-10-03,Travel allowance (TA),Calculated,6170.00,Unpaid,,,');
    expect(lines[2]).toBe('MR001,Asha Rao,2026-10-03,Meal,Claimed,150.50,Paid,2026-10-05,"Lunch, with client",');
  });
  it('marks a travel allowance whose distance was not calculated', () => {
    expect(expensesCsv([row({ distanceFlag: true })]).trimEnd().split('\r\n')[1]?.endsWith(',Yes')).toBe(true);
  });
  it('does not let an employee-typed remark run as a formula when the file is opened', () => {
    expect(expensesCsv([row({ remarks: '=1+1' })])).toContain("'=1+1");
  });
  it('writes only the header for no rows, and names the file by its range', () => {
    expect(expensesCsv([]).trimEnd().split('\r\n')).toHaveLength(1);
    expect(expensesFilename('2026-10-01', '2026-10-03')).toBe('expenses-2026-10-01-to-2026-10-03.csv');
  });
});
