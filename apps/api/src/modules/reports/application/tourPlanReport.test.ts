import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { TourPlanReport } from './tourPlanReport.js';
import { buildTourPlanWorkbook } from './tourPlanXlsx.js';

const identity = {
  async getUserSummaries(ids: string[]) { return ids.map((id) => ({ id, name: id === 'asm' ? 'Asha' : 'Colleague', employeeCode: 'X' })); },
  async listFieldEmployees(only?: string[]) { return [{ id: 'mr1', employeeCode: 'MR1', name: 'Ravi', designation: 'MR', hqId: null, zoneId: null }].filter((e) => !only || only.includes(e.id)); },
  async getDownline(id: string) { return id === 'asm' ? [{ id: 'mr1' }] : []; },
};
const territory = { async getRoute(id: string) { return id === 'r1' ? { id, name: 'Siliguri to Bagdogra', routeType: 'OUT_STATION' } : { id, name: 'Matigara', routeType: 'HQ' }; } };
const plan = (status: string) => ({
  async readTourPlanForExport() {
    return {
      status,
      entries: [
        { date: '2026-11-03', workingType: 'FIELD_WORK', dayKind: 'NORMAL', routeIds: ['r1', 'r2'], workWith: ['asm'], remarks: 'note', returnDate: null },
        { date: '2026-11-04', workingType: 'MEETING', dayKind: 'STAY', routeIds: [], workWith: [], remarks: null, returnDate: null },
      ],
      offDays: [{ date: '2026-11-01', reason: 'WEEKLY_OFF' as const, name: null }, { date: '2026-11-11', reason: 'HOLIDAY' as const, name: 'Bhai Duj' }],
    };
  },
});
const report = (status = 'APPROVED') => new TourPlanReport(plan(status), territory, identity);
const admin = { id: 'admin', role: 'ADMIN' };

describe('Tour Plan report', () => {
  it('has a row for every day, with off days, holidays and unplanned days named', async () => {
    const m = await report().read({ actor: admin, userId: 'mr1', month: '2026-11' });
    expect(m.rows).toHaveLength(30);
    expect(m.rows[0]).toMatchObject({ date: '2026-11-01', weekday: 'Sun', workType: 'Weekly off' });
    expect(m.rows[2]).toMatchObject({ workType: 'Field Work', routes: 'Siliguri to Bagdogra (Out-station), Matigara (HQ)', from: 'Siliguri; -', to: 'Bagdogra; Matigara', workWith: 'Asha', remarks: 'note' });
    expect(m.rows[3]).toMatchObject({ workType: 'Meeting', trip: 'Stay day' });
    expect(m.rows[10]).toMatchObject({ workType: 'Holiday · Bhai Duj' });
    expect(m.rows[4]).toMatchObject({ workType: 'Not planned' });
  });

  it('refuses a plan that is not approved', async () => {
    for (const status of ['DRAFT', 'SUBMITTED', 'REOPENED', 'REJECTED']) {
      await expect(report(status).read({ actor: admin, userId: 'mr1', month: '2026-11' })).rejects.toMatchObject({ statusCode: 409 });
    }
  });

  it('the employee and their manager may read it; someone else may not', async () => {
    await expect(report().read({ actor: { id: 'mr1', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).resolves.toBeTruthy();
    await expect(report().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).resolves.toBeTruthy();
    await expect(report().read({ actor: { id: 'other', role: 'FIELD' }, userId: 'mr1', month: '2026-11' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('the workbook has a real date column that fits, so a spreadsheet does not show ####', async () => {
    const m = await report().read({ actor: admin, userId: 'mr1', month: '2026-11' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTourPlanWorkbook(m)) as never);
    const ws = wb.getWorksheet('Tour Plan')!;
    expect(ws.getCell('A1').value).toBe('Tour Plan · November 2026');
    expect(ws.getCell('A2').value).toBe('Ravi · MR1 · MR');
    expect(ws.getRow(4).values).toEqual([undefined, 'Date', 'Day', 'Work type', 'Trip', 'Routes', 'From', 'To', 'Work with', 'Remarks']);
    expect(ws.getColumn(1).width).toBeGreaterThanOrEqual(12);
    expect(ws.getCell('A5').value).toBeInstanceOf(Date);
    expect(ws.getCell('A5').numFmt).toBe('dd mmm yyyy');
    expect(ws.rowCount).toBe(4 + 30);
  });
});
