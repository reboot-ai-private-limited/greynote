import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { fyLabel, monthlyUnits, sumRows, type SheetRow } from '../domain/secondarySheet.js';
import { MrStockFigures } from './mrStockFigures.js';
import { SecondarySheetReport } from './secondarySheetReport.js';
import { buildSecondarySheetWorkbook, colName } from './secondarySheetXlsx.js';

const config = { async get(key: string) { return key === 'FY_START_MONTH' ? 'APRIL' : null; } } as never;
const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

describe('the sheet’s small pieces', () => {
  it('labels the year and spreads a range target evenly over its months', () => {
    expect(fyLabel(2026, 4)).toBe('2026-27');
    expect(fyLabel(2026, 1)).toBe('2026');
    expect(monthlyUnits({ fromMonth: '2026-04', toMonth: '2026-06', qty: 90 }, months).slice(0, 4)).toEqual([30, 30, 30, 0]);
    expect(monthlyUnits({ fromMonth: '2026-11', toMonth: '2027-02', qty: 100 }, months).slice(7)).toEqual([25, 25, 25, 25, 0]);
    expect(monthlyUnits({ fromMonth: '2026-04', toMonth: '2026-04', qty: null }, months)).toEqual(months.map(() => 0));
  });

  it('adds MR rows product by product', () => {
    const row = (id: string, tgt: number, sec: number, prev: number | null): SheetRow => ({ productId: id, name: id, sku: id, nsrPaise: 1000, tgt: months.map(() => tgt), sec: months.map(() => sec), prevSec: prev });
    const sum = sumRows([[row('a', 1, 2, 5), row('b', 3, 4, null)], [row('a', 10, 20, null)]]);
    expect(sum.map((r) => r.productId)).toEqual(['a', 'b']);
    expect(sum[0]).toMatchObject({ tgt: months.map(() => 11), sec: months.map(() => 22), prevSec: 5 });
    expect(sum[1]!.prevSec).toBeNull();
  });
});

const lines = [
  { userId: 'mr1', distributorId: 'd1', productId: 'p1', month: '2026-04', openingQty: 0, primaryQty: 0, issuedQty: 50 },
  { userId: 'mr1', distributorId: 'd1', productId: 'p1', month: '2026-05', openingQty: 0, primaryQty: 0, issuedQty: 40 },
  { userId: 'mr1', distributorId: 'd1', productId: 'p1', month: '2025-06', openingQty: 0, primaryQty: 0, issuedQty: 60 },
  { userId: 'mr2', distributorId: 'd1', productId: 'p1', month: '2026-04', openingQty: 0, primaryQty: 0, issuedQty: 10 },
  { userId: 'mr2', distributorId: 'd1', productId: 'p2', month: '2026-09', openingQty: 0, primaryQty: 0, issuedQty: 7 },
];
const people = [
  { id: 'asm', employeeCode: 'ASM1', name: 'Anita', designation: 'ASM' },
  { id: 'mr1', employeeCode: 'MR1', name: 'Ravi', designation: 'MR' },
  { id: 'mr2', employeeCode: 'MR2', name: 'Sunita', designation: 'MR' },
  { id: 'other', employeeCode: 'MR9', name: 'Outside', designation: 'MR' },
];
const build = () =>
  new SecondarySheetReport(
    { async listTargetShares(ids) { return ids.includes('mr1') ? [{ id: 't', userId: 'mr1', productId: 'p1', fromMonth: '2026-04', toMonth: '2026-06', amountPaise: 0, qty: 90, sharePaise: 0, shareQty: 90 }] : []; } },
    { async listNames() { return { distributors: [], chemists: [], products: [{ id: 'p1', name: 'NEEDPRO BN', sku: '02', ptrPaise: 0, ptsPaise: 50_000 }, { id: 'p2', name: 'ALBU', sku: '01', ptrPaise: 0, ptsPaise: null }] }; }, async listAssignedDoctors() { return []; }, async listActiveOutlets() { return { distributors: [], chemists: [] }; }, async listDistributorAssignees() { return []; } },
    {
      async getUserSummaries() { return []; },
      async listFieldEmployees(only) { return people.filter((p) => !only || only.includes(p.id)).map((p) => ({ ...p, hqId: null, zoneId: null })); },
      async getDownline(id) { return id === 'asm' ? [{ id: 'mr1' }, { id: 'mr2' }] : []; },
      async getDesignationLevels(ids) { return ids.map((userId) => ({ userId, level: userId === 'asm' ? 2 : 1 })); },
    },
    config,
    new MrStockFigures({ listSecondaryLines: async (f) => lines.filter((l) => (!f.userIds || f.userIds.includes(l.userId)) && l.month >= f.fromMonth && l.month <= f.toMonth) }),
  );

describe('the Secondary Sales sheet data', () => {
  it('a manager gets their team: an MR sheet each, and themselves as the sum of the MRs below them', async () => {
    const m = await build().read({ actor: { id: 'asm', role: 'FIELD' }, year: 2026 });
    expect(m.label).toBe('2026-27');
    expect(m.scopeName).toBe('Anita');
    expect(m.people.map((p) => [p.kind, p.code])).toEqual([['TEAM', 'ASM1'], ['MR', 'MR1'], ['MR', 'MR2']]);
    const ravi = m.people.find((p) => p.code === 'MR1')!;
    expect(ravi.rows).toHaveLength(1);
    expect(ravi.rows[0]).toMatchObject({ name: 'NEEDPRO BN', nsrPaise: 50_000, tgt: [30, 30, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0], prevSec: 60 });
    expect(ravi.rows[0]!.sec.slice(0, 3)).toEqual([50, 40, 0]);
    const team = m.people[0]!;
    expect(team.members).toBe(2);
    expect(team.rows.map((r) => r.name)).toEqual(['ALBU', 'NEEDPRO BN']);
    expect(team.rows.find((r) => r.name === 'NEEDPRO BN')!.sec[0]).toBe(60);
    expect(m.mrCount).toBe(2);
    expect(m.mrsWithApproved).toBe(2);
  });

  it('who may ask: the office anyone, a manager only their own team, an MR nobody', async () => {
    expect((await build().read({ actor: { id: 'admin', role: 'ADMIN' }, year: 2026 })).mrCount).toBe(3);
    expect((await build().read({ actor: { id: 'admin', role: 'ADMIN' }, year: 2026, managerId: 'asm' })).mrCount).toBe(2);
    await expect(build().read({ actor: { id: 'asm', role: 'FIELD' }, year: 2026, managerId: 'other' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(build().read({ actor: { id: 'mr1', role: 'FIELD' }, year: 2026 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(build().read({ actor: { id: 'x', role: 'EMPLOYEE' as never }, year: 2026 })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('the workbook', () => {
  it('has a Summary, a roll-up and an MR sheet laid out like the company’s file, with figures that add up', async () => {
    const model = await build().read({ actor: { id: 'asm', role: 'FIELD' }, year: 2026 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSecondarySheetWorkbook(model)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'ASM1 TEAM', 'Ravi (MR1)', 'Sunita (MR2)']);
    const ws = wb.getWorksheet('Ravi (MR1)')!;
    expect(ws.getCell('A1').value).toBe('2026-27 Performance Sheet');
    expect(ws.getCell('J4').value).toBe("APRIL '26");
    expect(ws.getCell('V4').value).toBe('QTR - 1');
    expect(ws.getCell('AP4').value).toBe('1ST HALF');
    expect(ws.getCell('CD4').value).toBe('ANNUAL 2026 - 27');
    expect(ws.getCell('B5').value).toBe('PRODUCT');
    expect(ws.getCell('B6').value).toBe('NEEDPRO BN');
    expect(ws.getCell('C6').value).toBe(500);
    // April: target 30, secondary 50 -> 166.7 %; the first quarter adds April to June.
    expect(ws.getCell('J6').value).toBe(30);
    expect(ws.getCell('K6').value).toBe(50);
    expect((ws.getCell('M6').value as { result: number }).result).toBeCloseTo(166.67, 1);
    expect(ws.getCell('V6').value).toMatchObject({ result: 90 });
    expect(ws.getCell('W6').value).toMatchObject({ result: 90 });
    expect(ws.getCell('E6').value).toMatchObject({ result: 90 });
    // The year before gave 60, so growth is (90 / 60 - 1) x 100 = 50 %.
    expect((ws.getCell('H6').value as { result: number }).result).toBeCloseTo(50, 5);
    // Grand total in rupees lakh: 90 units x Rs 500 / 1,00,000 = 0.45.
    expect(ws.getCell('B7').value).toBe('GRAND TOTAL (₹ lakh)');
    expect((ws.getCell('E7').value as { result: number }).result).toBeCloseTo(0.45, 6);
    expect(colName(85)).toBe('CG');
    // The manager's roll-up is the sum of the MRs.
    const team = wb.getWorksheet('ASM1 TEAM')!;
    expect(team.getCell('C3').value).toBe(2);
    const rows = [6, 7].map((r) => [team.getCell(`B${r}`).value, (team.getCell(`E${r}`).value as { result: number }).result]);
    expect(rows).toEqual([['ALBU', 7], ['NEEDPRO BN', 100]]);
    // The summary adds the MRs only.
    const summary = wb.getWorksheet('Summary')!;
    expect(String(summary.getCell('A2').value)).toContain('2 MRs');
  });
});
