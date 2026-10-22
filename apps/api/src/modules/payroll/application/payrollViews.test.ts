import { describe, expect, it } from 'vitest';
import type { PayrollRun } from '../domain/payrollRun.entity.js';
import { PayrollViews } from './payrollViews.js';
import type { GenerateOutcome } from './usecases/payroll.usecase.js';

const run = (userId: string): PayrollRun => ({
  id: `run-${userId}`,
  userId,
  month: '2026-09',
  baseSalaryPaise: 3_000_000,
  ctcAnnualPaise: null,
  ctcEffectiveFrom: null,
  ctcLines: [],
  totalTaDaPaise: 100_000,
  reimbursementPaise: 0,
  unpaidLeaveDays: 0,
  leaveDeductionPaise: 0,
  absentDays: 0,
  absentDeductionPaise: 0,
  netPayablePaise: 3_100_000,
  days: [],
  adjustments: [],
  adjustmentPaise: 0,
  originalNetPayablePaise: 3_100_000,
  esiNumber: null,
  epfNumber: null,
  designationName: null,
  bankName: null,
  bankAccountNumber: null,
  dateOfJoining: null,
  deductionLines: [],
  statutoryDeductionPaise: 0,
  roundingPaise: 0,
  joinedInMonth: false,
  leftInMonth: false,
  status: 'DRAFT',
  generatedBy: 'acc',
  generatedAt: new Date('2026-10-01T00:00:00Z'),
  finalizedAt: null,
  finalizedBy: null,
  paidAt: null,
  paidBy: null,
  paymentReference: null,
});

function build() {
  const calls: string[][] = [];
  const identity = {
    getUserSummaries: async (ids: string[]) => {
      calls.push(ids);
      return ids.filter((id) => id !== 'ghost').map((id) => ({ id, name: `Name ${id}`, employeeCode: `E-${id}` }));
    },
  };
  return { views: new PayrollViews(identity as never), calls };
}

describe('PayrollViews', () => {
  it('names every run with one Identity call, however many, asking for each person once', async () => {
    const { views, calls } = build();
    const out = await views.many([run('a'), run('b'), run('a')]);
    expect(calls).toEqual([['a', 'b']]);
    expect(out.map((r) => [r.userId, r.userName, r.employeeCode])).toEqual([
      ['a', 'Name a', 'E-a'],
      ['b', 'Name b', 'E-b'],
      ['a', 'Name a', 'E-a'],
    ]);
    expect(out[0]).toMatchObject({ netPayablePaise: 3_100_000, status: 'DRAFT' });
  });

  it('leaves the name blank for someone Identity no longer returns, rather than failing', async () => {
    const { views } = build();
    expect(await views.one(run('ghost'))).toMatchObject({ userName: '', employeeCode: '' });
  });

  it('makes no call for an empty list', async () => {
    const { views, calls } = build();
    expect(await views.many([])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('names every line of a generate result: created, updated and skipped', async () => {
    const { views } = build();
    const outcomes: GenerateOutcome[] = [
      { userId: 'a', outcome: 'created', run: run('a') },
      { userId: 'b', outcome: 'updated', run: run('b') },
      { userId: 'c', outcome: 'skipped', reason: 'NO_CTC' as never, message: 'c has no CTC in force for 2026-09, so there is no salary to pay.' },
    ];
    const out = await views.outcomes(outcomes);
    expect(out.map((o) => [o.userId, o.outcome, o.userName])).toEqual([
      ['a', 'created', 'Name a'],
      ['b', 'updated', 'Name b'],
      ['c', 'skipped', 'Name c'],
    ]);
    expect(out[0]).toMatchObject({ run: { userName: 'Name a', employeeCode: 'E-a' } });
    expect(out[2]).toMatchObject({ message: expect.stringMatching(/no CTC/) });
  });
});
