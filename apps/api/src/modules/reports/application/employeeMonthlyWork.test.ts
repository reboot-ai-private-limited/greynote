import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { EmployeeMonthlyWorkReport } from './employeeMonthlyWorkReport.js';
import { buildMonthlyWorkWorkbook } from './employeeMonthlyWorkXlsx.js';

const config = { async get(key: string) { return key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : key === 'DAY_START_TIME' ? '00:00' : key === 'FY_START_MONTH' ? 'APRIL' : null; } } as never;
const now = () => new Date('2026-11-18T05:00:00Z');
const identity = {
  async getUserSummaries() { return []; },
  async listFieldEmployees(only?: string[]) { return [{ id: 'mr1', employeeCode: 'MR1', name: 'Ravi', designation: 'MR', hqId: null, zoneId: null }].filter((e) => !only || only.includes(e.id)); },
  async getDownline(id: string) { return id === 'asm' ? [{ id: 'mr1' }] : []; },
};
const territory = { async getRoute(id: string) { return { id, name: id === 'r1' ? 'North 1' : 'North 2' }; } };

const monthlyWork = () =>
  new EmployeeMonthlyWorkReport(
    {
      async listDailyPlanDays() { return [
        { date: '2026-11-02', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['a', 'b'], remarks: null, changedFromMonthly: false },
        { date: '2026-11-03', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r2'], workWith: [], doctorIds: ['b'], remarks: 'moved', changedFromMonthly: true },
      ]; },
      async listMonthlyPlanDays() { return [{ date: '2026-11-02', workingType: 'FIELD_WORK', dayKind: 'NORMAL', routeIds: ['r1'] }, { date: '2026-11-03', workingType: 'FIELD_WORK', dayKind: 'NORMAL', routeIds: ['r1'] }]; },
      async listPlannedDoctors() { return [{ doctorId: 'a', plannedDays: 1, missedSince: null }, { doctorId: 'b', plannedDays: 2, missedSince: '2026-11-02' }]; },
    },
    { async getActivityRange() { return [{ date: '2026-11-02', reportStatus: 'APPROVED', doctorCalls: [{ doctorId: 'a', geofence: 'PASS' }], chemistCalls: [{}, {}], followups: 1 }]; } },
    { async getMonth() { return { days: [{ date: '2026-11-01', status: 'WEEKLY_OFF' }, { date: '2026-11-02', status: 'PRESENT' }, { date: '2026-11-03', status: 'ABSENT' }] }; } },
    { async listOrders() { return [{ id: 'o', userId: 'mr1', outlet: { type: 'CHEMIST' as const, id: 'c' }, orderDate: '2026-11-02', status: 'PLACED' as const, totalAmountPaise: 150_000, remarks: null, items: [], completedBy: null, completedAt: null }]; } },
    territory,
    identity,
    { async listAssignedDoctors() { return [{ id: 'a', name: 'Dr A', specialty: 'GP', visitFrequency: 2 }, { id: 'b', name: 'Dr B', specialty: 'GP', visitFrequency: 1 }]; }, async getDoctorNames(ids: string[]) { return ids.map((id) => ({ id, name: `Dr ${id.toUpperCase()}` })); } },
    {
      async getExpenseStatement() { return { status: 'APPROVED' as const, paidPaise: 30_000, totals: { taPaise: 40_000, daPaise: 20_000, otherPaise: 5_000, totalPaise: 65_000 }, days: [
        { date: '2026-11-02', taPaise: 15_000, daPaise: 10_000, otherPaise: 0, totalPaise: 25_000, others: [] },
        { date: '2026-11-03', taPaise: 25_000, daPaise: 10_000, otherPaise: 5_000, totalPaise: 40_000, others: [{ amountPaise: 5_000, remarks: 'Parking' }] },
      ] }; },
      async listAcceptedExpenses() { return [{ id: '2', userId: 'mr1', reportDate: '2026-11-03', routeId: 'r2', type: 'TA' as const, source: 'AUTO' as const, amountPaise: 25_000, remarks: null, paymentStatus: 'UNPAID' as const, distanceFlag: true, paidAt: null }]; },
    },
    { async listLeaveDays(_u: string, from: string) { return from ? [{ date: '2026-11-04', portion: 1, paid: true }, { date: '2026-11-05', portion: 1, paid: false }] : []; } },
    config,
    now,
  );

describe('Monthly Work report data and workbook', () => {
  it('the month day by day: Tour Plan against Daily Plan, planned, visited, missed, carried, and the totals', async () => {
    const m = await monthlyWork().read({ actor: { id: 'admin', role: 'ADMIN' }, userId: 'mr1', month: '2026-11' });
    const d2 = m.work.rows[1]!;
    expect(d2).toMatchObject({ date: '2026-11-02', tourWords: 'North 1', dailyWords: 'North 1', planned: 2, visited: 1, missed: 1, carriedIn: 0, chemistCalls: 2, orders: 1, ordersPaise: 150_000, report: 'Approved', kind: 'Worked' });
    expect(m.work.rows[2]).toMatchObject({ date: '2026-11-03', tourWords: 'North 1', dailyWords: 'North 2', changed: true, planned: 1, missed: 1, carriedIn: 1, kind: 'Absent', report: 'No report' });
    expect(m.work.overview.doctors).toMatchObject({ plannedDays: 3, visited: 1, missed: 2, carriedAtEnd: 1 });
    expect(m.work.overview.targets).toEqual({ withTarget: 2, quota: 3, made: 1, missed: 2, notCalled: 1 });
  });

  it('the workbook: a row for every day with the kind, DCR, doctors, expenses and the totals', async () => {
    const m = await monthlyWork().read({ actor: { id: 'admin', role: 'ADMIN' }, userId: 'mr1', month: '2026-11' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildMonthlyWorkWorkbook(m)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Daily', 'Overview', 'Doctors']);
    const daily = wb.getWorksheet('Daily')!;
    expect(daily.getCell('A1').value).toBe('Ravi · November 2026 · FY 2026-27');
    expect(daily.getCell('A4').value).toBe('Date');
    // Row 5 is 1 November, row 6 the 2nd.
    expect(daily.getCell('A5').value).toBe('1 Nov 2026');
    expect(daily.getCell('C5').value).toBe('Weekly off');
    expect([daily.getCell('A6').value, daily.getCell('C6').value, daily.getCell('G6').value, daily.getCell('H6').value]).toEqual(['2 Nov 2026', 'Worked', 'Yes', 'Approved']);
    expect([daily.getCell('I6').value, daily.getCell('J6').value, daily.getCell('K6').value]).toEqual([1, 2, 1]);
    expect([daily.getCell('V6').value, daily.getCell('W6').value]).toEqual(['Dr A', 'Dr B']);
    expect([daily.getCell('R6').value, daily.getCell('S6').value, daily.getCell('T6').value]).toEqual([150, 100, 0]);
    expect(daily.getCell('U6').value).toMatchObject({ result: 250 });
    // 3 Nov: absent, a different route than the Tour Plan, carried in one, a flagged TA and an own claim.
    expect([daily.getCell('C7').value, daily.getCell('E7').value, daily.getCell('F7').value, daily.getCell('G7').value, daily.getCell('L7').value]).toEqual(['Absent', 'North 2', 'Yes', 'No', 1]);
    expect(String(daily.getCell('X7').value)).toContain('Parking');
    expect(String(daily.getCell('X7').value)).toContain('Distance not worked out');
    expect([daily.getCell('C8').value, daily.getCell('C9').value]).toEqual(['Paid leave', 'Unpaid leave']);
    expect(daily.getCell('A35').value).toBe('TOTAL');
    expect(daily.getCell('U35').value).toMatchObject({ result: 650 });
    const overview = wb.getWorksheet('Overview')!;
    const values = new Map<string, unknown>();
    overview.eachRow((row) => values.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(values.get('Paid leave')).toBe(1);
    expect(values.get('Unpaid leave')).toBe(1);
    expect(values.get('The month')).toBe('Approved');
    expect(values.get('Still to pay ₹')).toBe(350);
    const doctors = wb.getWorksheet('Doctors')!;
    expect([doctors.getCell('A5').value, doctors.getCell('A6').value]).toEqual(['Dr A', 'Dr B']);
  });

  it('who may ask: the office, the employee, their manager; nobody else', async () => {
    await expect(monthlyWork().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).resolves.toBeTruthy();
    await expect(monthlyWork().read({ actor: { id: 'mr1', role: 'FIELD' }, userId: 'mr1' })).resolves.toBeTruthy();
    await expect(monthlyWork().read({ actor: { id: 'other', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
