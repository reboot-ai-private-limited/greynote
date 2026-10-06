import type { GenerateOutcomeDto, PayrollRunDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  deductionExplanation,
  draftRuns,
  endedMonths,
  endedMonthsInYear,
  finalizeMessage,
  finalizeRuns,
  generateMessage,
  isGeneratable,
  monthBounds,
  monthLabel,
  monthState,
  needsAttention,
  netAddsUp,
  payrollCsv,
  payrollFilename,
  runTotals,
  skipLabel,
  summariseGenerate,
} from './payroll';

const run = (over: Partial<PayrollRunDto> = {}): PayrollRunDto => ({
  id: 'r1',
  userId: 'u1',
  userName: 'Asha Rao',
  employeeCode: 'MR001',
  month: '2026-09',
  baseSalaryPaise: 3_000_000,
  ctcAnnualPaise: null,
  ctcEffectiveFrom: null,
  ctcLines: [],
  totalTaDaPaise: 617_000,
  reimbursementPaise: 15_050,
  unpaidLeaveDays: 0,
  leaveDeductionPaise: 0,
  netPayablePaise: 3_632_050,
  esiNumber: null,
  joinedInMonth: false,
  status: 'DRAFT',
  generatedBy: 'acc',
  generatedAt: '2026-10-01T00:00:00Z',
  finalizedAt: null,
  ...over,
});

describe('months', () => {
  it('lets only a month that has ended be generated', () => {
    expect(isGeneratable('2026-09', '2026-10-03')).toBe(true);
    expect(isGeneratable('2026-10', '2026-10-03')).toBe(false);
    expect(isGeneratable('2026-11', '2026-10-03')).toBe(false);
    expect(isGeneratable('2025-12', '2026-01-01')).toBe(true);
    expect(isGeneratable('nonsense', '2026-10-03')).toBe(false);
  });
  it('lists ended months newest first, across a year end', () => {
    expect(endedMonths('2026-10-03', 3)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(endedMonths('2026-01-15', 3)).toEqual(['2025-12', '2025-11', '2025-10']);
    expect(endedMonths('2026-10-03').length).toBe(18);
  });
  it('lists the ended months of a financial year, newest first, never one that has not ended', () => {
    expect(endedMonthsInYear(2026, '2026-10-03')).toEqual(['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
    expect(endedMonthsInYear(2026, '2027-02-10')).toEqual(['2027-01', '2026-12', '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
  });
  it('lists all twelve for a year that is over, and none in April of a new year', () => {
    expect(endedMonthsInYear(2025, '2026-10-03')).toHaveLength(12);
    expect(endedMonthsInYear(2025, '2026-10-03')[0]).toBe('2026-03');
    expect(endedMonthsInYear(2026, '2026-04-15')).toEqual([]);
  });
  it('labels a month and finds its first and last day, in a leap year too', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(monthBounds('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('the sheet', () => {
  const runs = [run(), run({ id: 'r2', userId: 'u2', status: 'FINALIZED', joinedInMonth: true, leaveDeductionPaise: 100_000, netPayablePaise: 3_532_050 })];
  it('totals the money and counts the drafts, the final and the joiners', () => {
    expect(runTotals(runs)).toEqual({
      employees: 2,
      drafts: 1,
      finalized: 1,
      joinedInMonth: 1,
      basePaise: 6_000_000,
      taDaPaise: 1_234_000,
      reimbursementPaise: 30_100,
      deductionPaise: 100_000,
      netPaise: 7_164_100,
    });
    expect(runTotals([]).employees).toBe(0);
  });
  it('finds the drafts and the state of the whole month', () => {
    expect(draftRuns(runs).map((r) => r.id)).toEqual(['r1']);
    expect(monthState([])).toBe('none');
    expect(monthState(runs)).toBe('draft');
    expect(monthState([run({ status: 'FINALIZED' })])).toBe('final');
  });
  it('checks that net is base plus TA/DA plus reimbursement minus the deduction', () => {
    expect(netAddsUp(run())).toBe(true);
    expect(netAddsUp(run({ netPayablePaise: 1 }))).toBe(false);
    expect(netAddsUp(run({ leaveDeductionPaise: 100_000, netPayablePaise: 3_532_050 }))).toBe(true);
  });
  it('explains the deduction in words, with no deduction when there was no unpaid leave', () => {
    expect(deductionExplanation(run())).toBe('No unpaid leave, so nothing is deducted.');
    expect(deductionExplanation(run({ unpaidLeaveDays: 2.5, baseSalaryPaise: 3_000_000, leaveDeductionPaise: 250_000 }))).toMatch(/^2\.5 unpaid days × ₹30,000\.00 ÷ 30 = ₹2,500\.00/);
    expect(deductionExplanation(run({ unpaidLeaveDays: 1, leaveDeductionPaise: 100_000 }))).toMatch(/^1 unpaid day ×/);
  });
});

describe('generating', () => {
  const outcomes: GenerateOutcomeDto[] = [
    { userId: 'a', userName: 'A', employeeCode: 'E1', outcome: 'created', run: run() },
    { userId: 'b', userName: 'B', employeeCode: 'E2', outcome: 'updated', run: run() },
    { userId: 'c', userName: 'C', employeeCode: 'E3', outcome: 'skipped', reason: 'ALREADY_FINALIZED', message: 'already' },
    { userId: 'd', userName: 'D', employeeCode: 'E4', outcome: 'skipped', reason: 'NO_CTC', message: 'D has no CTC in force for 2026-09, so there is no salary to pay.' },
  ];
  it('counts each outcome and keeps the skipped lines', () => {
    const s = summariseGenerate(outcomes);
    expect(s).toMatchObject({ created: 1, updated: 1 });
    expect(s.skipped.map((o) => o.userId)).toEqual(['c', 'd']);
    expect(generateMessage(s)).toBe('1 created, 1 updated, 2 skipped');
  });
  it('says so when there was nobody to generate for', () => {
    expect(generateMessage(summariseGenerate([]))).toBe('Nobody to generate for.');
  });
  it('treats "already finalized" as expected and anything else skipped as something to look at', () => {
    expect(needsAttention(summariseGenerate(outcomes)).map((o) => o.userId)).toEqual(['d']);
  });
  it('names a reason, and shows one it does not know as it is', () => {
    expect(skipLabel('NO_CTC')).toBe('No CTC');
    expect(skipLabel('SOMETHING_NEW' as never)).toBe('SOMETHING_NEW');
  });
});

describe('finalizeRuns', () => {
  it('finalizes each in order, keeps going after a refusal and keeps its message', async () => {
    const result = await finalizeRuns(async (id) => {
      if (id === 'b') throw new Error('This payroll run is already finalized.');
    }, ['a', 'b', 'c']);
    expect(result.finalized).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ id: 'b', message: 'This payroll run is already finalized.' }]);
    expect(finalizeMessage(result, 3)).toBe('2 of 3 finalized. 1 could not be: they are unchanged.');
    expect(finalizeMessage({ finalized: ['a'], failed: [] }, 1)).toBe('1 of 1 finalized.');
  });
});

describe('payrollCsv', () => {
  it('writes one row per employee with plain-number rupees and the status', () => {
    const lines = payrollCsv([run(), run({ id: 'r2', userName: '=cmd', status: 'FINALIZED', joinedInMonth: true, unpaidLeaveDays: 2.5 })]).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Employee code,Employee,Month,Base salary (INR),TA and DA paid (INR),Reimbursements paid (INR),Unpaid leave days,Leave deduction (INR),Net payable (INR),Joined this month,Status');
    expect(lines[1]).toBe('MR001,Asha Rao,2026-09,30000.00,6170.00,150.50,0,0.00,36320.50,,Draft');
    expect(lines[2]).toBe("MR001,'=cmd,2026-09,30000.00,6170.00,150.50,2.5,0.00,36320.50,Yes,Finalized");
  });
  it('names the file by its month', () => {
    expect(payrollFilename('2026-09')).toBe('payroll-2026-09.csv');
  });
});
