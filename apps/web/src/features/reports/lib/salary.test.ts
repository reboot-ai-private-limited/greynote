import type { SalaryMonthDto, SalaryRowDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { salaryEmployeesCsv, salaryEmployeesFilename, salaryMatrix, salaryMonthsCsv, startedMonths, wholeRupees } from './salary';

const f = { basePaise: 3_000_000, leaveDeductionPaise: 100_000, absentDeductionPaise: 0, netPaise: 2_900_000, employerPaise: 360_000, costToCompanyPaise: 3_260_000 };
const month = (over: Partial<SalaryMonthDto> = {}): SalaryMonthDto => ({ month: '2026-04', state: 'FINAL', finalEmployees: 1, draftEmployees: 0, draftNetPaise: 0, taPaise: 10_000, daPaise: 20_000, reimbursementPaise: 3_000, ...f, ...over });
const row = (over: Partial<SalaryRowDto> = {}): SalaryRowDto => ({ month: '2026-04', user: { id: 'u1', name: 'Asha Rao', employeeCode: 'MR001' }, status: 'FINALIZED', runId: 'r1', ...f, ...over });

describe('wholeRupees', () => {
  it('writes rupees with Indian grouping and no paise', () => {
    expect(wholeRupees(2_900_000)).toBe('₹29,000');
    expect(wholeRupees(1_234_567_800)).toBe('₹1,23,45,678');
    expect(wholeRupees(0)).toBe('₹0');
  });
});

describe('salaryMatrix', () => {
  it('one row per employee by name, their runs by month, the total counting only finalized runs', () => {
    const rows = [
      row({ month: '2026-04', netPaise: 100 }),
      row({ month: '2026-05', netPaise: 200 }),
      row({ month: '2026-06', netPaise: 999, status: 'DRAFT' }),
      row({ user: { id: 'u0', name: 'Aman Das', employeeCode: 'MR000' }, month: '2026-04', netPaise: 50 }),
    ];
    const m = salaryMatrix({ rows });
    expect(m.map((r) => r.user.name)).toEqual(['Aman Das', 'Asha Rao']);
    expect(m[1]).toMatchObject({ netFinalPaise: 300, draftCount: 1 });
    expect(m[1]!.byMonth.get('2026-06')?.status).toBe('DRAFT');
    expect(m[1]!.byMonth.get('2026-07')).toBeUndefined();
    expect(m[0]).toMatchObject({ netFinalPaise: 50, draftCount: 0 });
  });
  it('an empty year is no rows', () => {
    expect(salaryMatrix({ rows: [] })).toEqual([]);
  });
});

describe('the CSVs', () => {
  it('the months: only those that have started, with the status in words and the draft net apart', () => {
    const lines = salaryMonthsCsv({ months: [month(), month({ month: '2026-09', state: 'DRAFT', finalEmployees: 0, draftEmployees: 3, draftNetPaise: 8_700_000, basePaise: 0, leaveDeductionPaise: 0, netPaise: 0, employerPaise: 0, costToCompanyPaise: 0 }), month({ month: '2026-12', state: 'FUTURE' })] }).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('Apr 26,Finalized,1,0,30000.00,1000.00,0.00,29000.00,3600.00,32600.00,0.00,100.00,200.00,30.00');
    expect(lines[2]).toBe('Sep 26,Draft,0,3,0.00,0.00,0.00,0.00,0.00,0.00,87000.00,100.00,200.00,30.00');
    expect(startedMonths([month(), month({ state: 'FUTURE' }), month({ state: 'OPEN' })])).toHaveLength(2);
  });
  it('the employees: every run, draft or final, with the code and name', () => {
    const lines = salaryEmployeesCsv({ rows: [row(), row({ month: '2026-09', status: 'DRAFT', user: { id: 'u2', name: 'Bimal, Das', employeeCode: 'MR002' } })] }).trimEnd().split('\r\n');
    expect(lines[1]).toBe('Apr 26,MR001,Asha Rao,Finalized,30000.00,1000.00,0.00,29000.00,3600.00,32600.00');
    expect(lines[2]).toBe('Sep 26,MR002,"Bimal, Das",Draft,30000.00,1000.00,0.00,29000.00,3600.00,32600.00');
    expect(salaryEmployeesFilename(2026)).toBe('salary-employees-2026-27.csv');
  });
});
