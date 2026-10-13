import type { ExpenseAuditRowDto, PayrollRunDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  approvalsTile,
  devicesTile,
  employeesTile,
  EXPENSE_CAP,
  missingStockTile,
  payrollTile,
  unpaidExpensesTile,
} from './tiles';

const expense = (amountPaise: number): ExpenseAuditRowDto => ({
  id: String(amountPaise),
  userId: 'u',
  userName: 'n',
  employeeCode: 'E',
  reportDate: '2026-09-01',
  type: 'TA',
  source: 'AUTO',
  amountPaise,
  remarks: null,
  paymentStatus: 'UNPAID',
  distanceFlag: false,
  routeId: null,
  paidBy: null,
  paidAt: null,
});

const run = (status: PayrollRunDto['status']): PayrollRunDto => ({
  id: status,
  userId: 'u',
  userName: 'n',
  employeeCode: 'E',
  month: '2026-09',
  baseSalaryPaise: 100,
  ctcAnnualPaise: null,
  ctcEffectiveFrom: null,
  ctcLines: [],
  totalTaDaPaise: 0,
  reimbursementPaise: 0,
  unpaidLeaveDays: 0,
  leaveDeductionPaise: 0,
  absentDays: 0,
  absentDeductionPaise: 0,
  netPayablePaise: 100,
  days: [],
  adjustments: [],
  adjustmentPaise: 0,
  originalNetPayablePaise: 0,
  esiNumber: null,
  joinedInMonth: false,
  generatedBy: 'acc',
  status,
  generatedAt: '2026-10-01T00:00:00Z',
  finalizedAt: null,
  finalizedByName: null,
  paidAt: null,
  paidByName: null,
  paymentReference: null,
});

describe('approvalsTile', () => {
  it('is "All clear" when nothing waits', () => {
    expect(approvalsTile({ items: [], page: 1, pageSize: 5, total: 0, totalPages: 1 })).toMatchObject({
      value: '0',
      tone: 'success',
    });
  });

  it('shows the total and how long the oldest has waited', () => {
    const page = {
      items: [
        { submittedAt: '2026-09-30T12:00:00Z' },
        { submittedAt: '2026-09-28T12:00:00Z' },
      ] as never,
      page: 1,
      pageSize: 5,
      total: 12,
      totalPages: 3,
    };
    expect(approvalsTile(page, new Date('2026-10-01T12:00:00Z'))).toEqual({
      value: '12',
      note: 'Oldest waiting 3d',
      tone: 'warning',
    });
  });
});

describe('devicesTile / missingStockTile', () => {
  it('count rows, and are clear at zero', () => {
    expect(devicesTile([])).toMatchObject({ value: '0', tone: 'success' });
    expect(devicesTile([{}, {}] as never)).toMatchObject({ value: '2', tone: 'warning' });
    expect(missingStockTile([{ outlets: [1, 2] }, { outlets: [1] }] as never)).toMatchObject({
      value: '2',
      note: '3 outlets not reported',
    });
  });
});

describe('employeesTile', () => {
  it('mentions onboarding only when there is some', () => {
    expect(employeesTile({ active: 40, pending: 0 }).note).toBeUndefined();
    expect(employeesTile({ active: 40, pending: 3 }).note).toBe('3 onboarding');
  });
});

describe('unpaidExpensesTile', () => {
  it('sums the claims', () => {
    expect(unpaidExpensesTile([expense(150_00), expense(50_00)]).value).toContain('200.00');
  });

  it('refuses to show a total when the list hit its cap', () => {
    const capped = Array.from({ length: EXPENSE_CAP }, (_, i) => expense(i + 1));
    const tile = unpaidExpensesTile(capped);
    expect(tile.value).toBe('500+ claims');
    expect(tile.value).not.toMatch(/₹/);
  });
});

describe('payrollTile', () => {
  it('says so when the month has no runs', () => {
    expect(payrollTile([]).value).toBe('Not generated');
  });
  it('is Draft while any run is a draft, Finalized once none are', () => {
    expect(payrollTile([run('DRAFT'), run('FINALIZED')]).value).toBe('Draft');
    expect(payrollTile([run('FINALIZED')]).value).toBe('Finalized');
  });
});
