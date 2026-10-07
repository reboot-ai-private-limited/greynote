import type { TaDaDaysDto, TaDaMonthDto, TaDaMrRowDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { defaultMonth, paidPercent, rowsOfMonth, taDaDaysCsv, taDaEmployeesCsv, taDaMonthsCsv, taDaYearFilename } from './taDa';

const f = { taPaise: 30_000, daPaise: 20_000, reimbursementPaise: 5_000, totalPaise: 55_000, paidPaise: 55_000, unpaidPaise: 0, flaggedRows: 0 };
const month = (over: Partial<TaDaMonthDto> = {}): TaDaMonthDto => ({ month: '2026-04', state: 'ENDED', employees: 2, ...f, ...over });
const row = (over: Partial<TaDaMrRowDto> = {}): TaDaMrRowDto => ({ month: '2026-04', mr: { id: 'u1', name: 'Asha Rao', employeeCode: 'MR001' }, ...f, ...over });

describe('rowsOfMonth', () => {
  it('keeps the month\'s employees, biggest total first', () => {
    const rows = [row({ totalPaise: 10 }), row({ mr: { id: 'u2', name: 'Bimal', employeeCode: 'MR002' }, totalPaise: 90 }), row({ month: '2026-05', totalPaise: 999 })];
    expect(rowsOfMonth({ rows }, '2026-04').map((r) => r.mr.name)).toEqual(['Bimal', 'Asha Rao']);
  });
});

describe('defaultMonth', () => {
  it('is the latest month with claims, else the latest started, else nothing', () => {
    const months = [month({ month: '2026-04' }), month({ month: '2026-05' }), month({ month: '2026-06', employees: 0 }), month({ month: '2026-07', state: 'FUTURE', employees: 0 })];
    expect(defaultMonth(months)).toBe('2026-05');
    expect(defaultMonth([month({ month: '2026-04', employees: 0 }), month({ month: '2026-05', state: 'FUTURE', employees: 0 })])).toBe('2026-04');
    expect(defaultMonth([])).toBe('');
  });
});

describe('paidPercent', () => {
  it('is the paid share as a whole percent, and 0 for nothing', () => {
    expect(paidPercent({ totalPaise: 200, paidPaise: 50 })).toBe(25);
    expect(paidPercent({ totalPaise: 3, paidPaise: 1 })).toBe(33);
    expect(paidPercent({ totalPaise: 0, paidPaise: 0 })).toBe(0);
  });
});

describe('the CSVs', () => {
  it('the year: a row per month that has started, rupees as plain numbers', () => {
    const lines = taDaMonthsCsv({ months: [month(), month({ month: '2026-05', state: 'FUTURE' })] }).trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('Apr 26,2,300.00,200.00,50.00,550.00,550.00,0.00,0');
  });
  it('the employees of a month', () => {
    expect(taDaEmployeesCsv([row({ unpaidPaise: 100, flaggedRows: 2 })]).trimEnd().split('\r\n')[1]).toBe('Apr 26,MR001,Asha Rao,300.00,200.00,50.00,550.00,550.00,1.00,2');
  });
  it('the days: route, status, paid date and flags', () => {
    const d: Pick<TaDaDaysDto, 'rows'> = {
      rows: [
        { date: '2026-05-04', type: 'TA', source: 'AUTO', route: { id: 'r1', name: 'Siliguri, Naxalbari' }, amountPaise: 9_000, status: 'PAID', paidAt: '2026-06-15T05:00:00.000Z', distanceFlag: true, remarks: null },
        { date: '2026-05-05', type: 'MEAL', source: 'MANUAL', route: null, amountPaise: 3_000, status: 'UNPAID', paidAt: null, distanceFlag: false, remarks: 'lunch' },
      ],
    };
    const lines = taDaDaysCsv(d).trimEnd().split('\r\n');
    expect(lines[1]).toBe('2026-05-04,TA,"Siliguri, Naxalbari",90.00,Paid,2026-06-15,Yes,');
    expect(lines[2]).toBe('2026-05-05,Meal,,30.00,Unpaid,,,lunch');
    expect(taDaYearFilename(2026)).toBe('ta-da-2026-27.csv');
  });
});
