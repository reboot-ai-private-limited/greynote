import type { DailyPlanDto, ExpenseStatementDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { dailyPlanCsv } from './dailyPlanCsv';
import { dcrCsv } from './dcrCsv';
import { expenseMonthCsv } from './expenseMonthCsv';
import { secondarySalesCsv } from './secondarySalesCsv';

const rows = (csv: string) => csv.trimEnd().split('\r\n').map((l) => l.split(','));
const names = { routeLabel: (id: string) => `R-${id}`, personName: (id: string) => `P-${id}`, doctorName: (id: string) => `Dr ${id}` };

describe('dailyPlanCsv', () => {
  const plan: Parameters<typeof dailyPlanCsv>[0] = {
    planDate: '2026-10-24', workingType: 'FIELD_WORK', dayKind: 'NORMAL', routeIds: ['a', 'b'], workWith: ['u1'], remarks: null, status: 'APPROVED',
    doctors: [{ doctorId: 'd1', carriedFrom: null }, { doctorId: 'd2', carriedFrom: '2026-10-20' }] as DailyPlanDto['doctors'],
  };
  it('has a row per doctor, repeating the day', () => {
    const out = rows(dailyPlanCsv(plan, names));
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual(['2026-10-24', 'Field work', 'Normal', 'R-a; R-b', 'Dr d1', '', 'P-u1', '', 'APPROVED']);
    expect(out[2]![5]).toBe('2026-10-20');
  });
  it('has one row when no doctors are planned', () => {
    expect(rows(dailyPlanCsv({ ...plan, doctors: [] }, names))).toHaveLength(2);
  });
});

describe('dcrCsv', () => {
  const geofence = { status: 'PASS', distanceMeters: 40, reason: null, overriddenBy: null, overriddenAt: null, overrideComment: null } as const;
  const base = { dcrId: 'x', userId: 'u', reportDate: '2026-10-24', workingType: 'FIELD_WORK', routeId: 'r1', routeType: 'HQ', workWith: [], remarks: null, capturedLocation: null, accuracyMeters: null, geofence } as const;
  const dcr = {
    reportDate: '2026-10-24',
    doctorCalls: [{ ...base, id: '1', doctorId: 'd', doctorName: 'Dr Rao', notInPlan: true, routeNotInPlan: false, samples: [{ allocationId: 'a', productId: 'p', productName: 'Cefix', quantity: 3 }], recordedAt: '2026-10-24T05:00:00Z' }],
    chemistCalls: [{ ...base, id: '2', chemistId: 'c', chemistName: 'Shree Meds', routeNotInPlan: false, recordedAt: '2026-10-24T04:00:00Z' }],
    followups: [],
  } as unknown as Parameters<typeof dcrCsv>[0];
  it('lists every call in the order recorded, with samples and flags', () => {
    const out = rows(dcrCsv(dcr, names));
    expect(out.map((r) => r[1])).toEqual(['Type', 'Chemist call', 'Doctor call']);
    expect(out[2]!.slice(2, 4)).toEqual(['Dr Rao', 'R-r1']);
    expect(out[2]![9]).toBe('Yes');
    expect(out[2]![10]).toBe('Cefix x 3');
  });
});

describe('expenseMonthCsv', () => {
  const statement: Pick<ExpenseStatementDto, 'days' | 'totals' | 'status'> = {
    status: 'SUBMITTED',
    days: [{ date: '2026-10-01', taPaise: 12050, daPaise: 5000, otherPaise: 100, totalPaise: 17150, others: [{ id: 'o', amountPaise: 100, remarks: 'Parking, lot' }] }],
    totals: { taPaise: 12050, daPaise: 5000, otherPaise: 100, totalPaise: 17150 },
  };
  it('writes rupees per day and a total row', () => {
    const csv = expenseMonthCsv(statement);
    expect(csv).toContain('2026-10-01,120.50,50.00,1.00,171.50,"Parking, lot",SUBMITTED');
    expect(rows(csv).at(-1)!.slice(0, 5)).toEqual(['Total', '120.50', '50.00', '1.00', '171.50']);
  });
});

describe('secondarySalesCsv', () => {
  const line = (name: string, opening: number, primary: number, issued: number, pts: number | null, saved = true) => ({ product: { name, sku: name.toUpperCase() }, openingQty: opening, primaryQty: primary, issuedQty: issued, closingQty: opening + primary - issued, ptsPaise: pts, issuedAmountPaise: pts === null ? null : issued * pts, saved });
  it('lists the figures per distributor and product, leaves unsent defaults out, and totals', () => {
    const out = rows(secondarySalesCsv({ distributors: [{ name: 'Shree', lines: [line('Cefix', 10, 20, 5, 5000), line('Zerodol', 0, 0, 0, 100, false)] }, { name: 'Maa Tara', lines: [line('Pan', 1, 2, 2, 1000)] }] }));
    expect(out.map((r) => r[0])).toEqual(['Distributor', 'Shree', 'Maa Tara', 'Total']);
    expect(out[1]).toEqual(['Shree', 'Cefix', 'CEFIX', '10', '20', '5', '25', '50.00', '250.00']);
    expect(out[3]).toEqual(['Total', '', '', '11', '22', '7', '26', '', '270.00']);
  });
});
