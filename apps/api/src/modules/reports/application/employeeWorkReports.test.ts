import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { EmployeeDailyWorkReport } from './employeeDailyWorkReport.js';
import { buildDailyWorkWorkbook } from './employeeDailyWorkXlsx.js';
import { EmployeeExpenseReport } from './employeeExpenseReport.js';
import { buildExpenseWorkbook } from './employeeExpenseXlsx.js';

const config = { async get(key: string) { return key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : key === 'DAY_START_TIME' ? '00:00' : null; } } as never;
const now = () => new Date('2026-11-18T05:00:00Z');
const identity = {
  async getUserSummaries() { return []; },
  async listFieldEmployees(only?: string[]) { return [{ id: 'mr1', employeeCode: 'MR1', name: 'Ravi', designation: 'MR', hqId: null, zoneId: null }].filter((e) => !only || only.includes(e.id)); },
  async getDownline(id: string) { return id === 'asm' ? [{ id: 'mr1' }] : []; },
};
const territory = { async getRoute(id: string) { return { id, name: id === 'r1' ? 'North 1' : 'North 2' }; } };

const dailyWork = () =>
  new EmployeeDailyWorkReport(
    {
      async listDailyPlanDays() { return [
        { date: '2026-11-02', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['a', 'b'], remarks: null, changedFromMonthly: false },
        { date: '2026-11-03', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r2'], workWith: [], doctorIds: ['b'], remarks: 'moved', changedFromMonthly: true },
      ]; },
      async listMonthlyPlanDays() { return [{ date: '2026-11-02', workingType: 'FIELD_WORK', dayKind: 'NORMAL', routeIds: ['r1'] }, { date: '2026-11-03', workingType: 'FIELD_WORK', dayKind: 'NORMAL', routeIds: ['r1'] }]; },
      async listPlannedDoctors() { return [{ doctorId: 'a', plannedDays: 1, missedSince: null }, { doctorId: 'b', plannedDays: 2, missedSince: '2026-11-02' }]; },
    },
    { async getActivityRange() { return [{ date: '2026-11-02', reportStatus: 'APPROVED', doctorCalls: [{ doctorId: 'a', geofence: 'PASS' }], chemistCalls: [{}, {}], followups: 1 }]; } },
    { async getMonth() { return { days: [{ date: '2026-11-02', status: 'PRESENT' }, { date: '2026-11-03', status: 'ABSENT' }] }; } },
    { async listOrders() { return [{ id: 'o', userId: 'mr1', outlet: { type: 'CHEMIST' as const, id: 'c' }, orderDate: '2026-11-02', status: 'PLACED' as const, totalAmountPaise: 150_000, remarks: null, items: [], completedBy: null, completedAt: null }]; } },
    territory,
    identity,
    { async listAssignedDoctors() { return [{ id: 'a', name: 'Dr A', specialty: 'GP', visitFrequency: 2 }, { id: 'b', name: 'Dr B', specialty: 'GP', visitFrequency: 1 }]; }, async getDoctorNames(ids: string[]) { return ids.map((id) => ({ id, name: `Dr ${id.toUpperCase()}` })); } },
    config,
    now,
  );

describe('Daily Work report data and workbook', () => {
  it('the month day by day: Tour Plan against Daily Plan, planned, visited, missed, carried, and the totals', async () => {
    const m = await dailyWork().read({ actor: { id: 'admin', role: 'ADMIN' }, userId: 'mr1', month: '2026-11' });
    const d2 = m.work.rows[1]!;
    expect(d2).toMatchObject({ date: '2026-11-02', tourWords: 'North 1', dailyWords: 'North 1', planned: 2, visited: 1, missed: 1, carriedIn: 0, chemistCalls: 2, orders: 1, ordersPaise: 150_000, report: 'Approved', kind: 'Worked' });
    expect(m.work.rows[2]).toMatchObject({ date: '2026-11-03', tourWords: 'North 1', dailyWords: 'North 2', changed: true, planned: 1, missed: 1, carriedIn: 1, kind: 'Absent', report: 'No report' });
    expect(m.work.overview.doctors).toMatchObject({ plannedDays: 3, visited: 1, missed: 2, carriedAtEnd: 1 });
    expect(m.work.overview.targets).toEqual({ withTarget: 2, quota: 3, made: 1, missed: 2, notCalled: 1 });
  });

  it('the workbook has Overview, Daily and Doctors with the numbers in place', async () => {
    const m = await dailyWork().read({ actor: { id: 'admin', role: 'ADMIN' }, userId: 'mr1', month: '2026-11' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildDailyWorkWorkbook(m)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Overview', 'Daily', 'Doctors']);
    expect(wb.getWorksheet('Overview')!.getCell('A1').value).toBe('Daily Work report · November 2026');
    const daily = wb.getWorksheet('Daily')!;
    expect(daily.getCell('A4').value).toBe('Date');
    expect(daily.getCell('A6').value).toBe('2026-11-02');
    expect(daily.getCell('H6').value).toBe(2);
    expect(daily.getCell('J6').value).toBe(1);
    expect([daily.getCell('S6').value, daily.getCell('T6').value]).toEqual(['Dr A', 'Dr B']);
    expect(daily.getCell('E7').value).toBe('North 2');
    const doctors = wb.getWorksheet('Doctors')!;
    expect([doctors.getCell('A5').value, doctors.getCell('A6').value]).toEqual(['Dr A', 'Dr B']);
  });

  it('who may ask: the office, the employee, their manager; nobody else', async () => {
    await expect(dailyWork().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).resolves.toBeTruthy();
    await expect(dailyWork().read({ actor: { id: 'mr1', role: 'FIELD' }, userId: 'mr1' })).resolves.toBeTruthy();
    await expect(dailyWork().read({ actor: { id: 'other', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('Expense report data and workbook', () => {
  const expenses = () =>
    new EmployeeExpenseReport(
      {
        async getExpenseStatement() { return { status: 'APPROVED' as const, paidPaise: 30_000, totals: { taPaise: 40_000, daPaise: 20_000, otherPaise: 5_000, totalPaise: 65_000 }, days: [
          { date: '2026-11-03', taPaise: 25_000, daPaise: 10_000, otherPaise: 5_000, totalPaise: 40_000, others: [{ amountPaise: 5_000, remarks: 'Parking' }] },
          { date: '2026-11-02', taPaise: 15_000, daPaise: 10_000, otherPaise: 0, totalPaise: 25_000, others: [] },
          { date: '2026-11-04', taPaise: 0, daPaise: 0, otherPaise: 0, totalPaise: 0, others: [] },
        ] }; },
        async listAcceptedExpenses() { return [
          { id: '1', userId: 'mr1', reportDate: '2026-11-02', routeId: 'r1', type: 'TA' as const, source: 'AUTO' as const, amountPaise: 15_000, remarks: null, paymentStatus: 'PAID' as const, distanceFlag: false, paidAt: new Date() },
          { id: '2', userId: 'mr1', reportDate: '2026-11-03', routeId: 'r2', type: 'TA' as const, source: 'AUTO' as const, amountPaise: 25_000, remarks: null, paymentStatus: 'UNPAID' as const, distanceFlag: true, paidAt: null },
        ]; },
      },
      territory,
      identity,
      config,
      now,
    );

  it('a row a day (oldest first, empty days left out) with route, claims and payment', async () => {
    const m = await expenses().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'mr1', month: '2026-11' });
    expect(m.days.map((d) => [d.date, d.route, d.totalPaise, d.payment, d.flagged, d.notes])).toEqual([
      ['2026-11-02', 'North 1', 25_000, 'Paid', false, ''],
      ['2026-11-03', 'North 2', 40_000, 'Unpaid', true, 'Parking'],
    ]);
  });

  it('the workbook: header, rows with formulas, total, overview', async () => {
    const m = await expenses().read({ actor: { id: 'admin', role: 'ADMIN' }, userId: 'mr1', month: '2026-11' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildExpenseWorkbook(m)) as never);
    const ws = wb.getWorksheet('Expenses')!;
    expect(ws.getCell('A1').value).toBe('Expense report · November 2026');
    expect(String(ws.getCell('A3').value)).toContain('Approved');
    expect(ws.getCell('B6').value).toBe('North 1');
    expect(ws.getCell('C6').value).toBe(150);
    expect(ws.getCell('F7').value).toMatchObject({ result: 400 });
    expect(ws.getCell('A8').value).toBe('TOTAL');
    expect(ws.getCell('F8').value).toMatchObject({ result: 650 });
    expect(wb.getWorksheet('Overview')!.getCell('B11').value).toBe(350);
  });
});
