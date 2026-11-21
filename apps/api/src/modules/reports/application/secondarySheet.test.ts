import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { fyLabel, monthlyUnits, sumRows, type SheetRow } from '../domain/secondarySheet.js';
import { MrStockFigures } from './mrStockFigures.js';
import { SecondarySheetReport } from './secondarySheetReport.js';
import { buildSecondarySheetWorkbook, colName } from './secondarySheetXlsx.js';

const config = { async get(key: string) { return key === 'FY_START_MONTH' ? 'APRIL' : key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : key === 'DAY_START_TIME' ? '00:00' : null; } } as never;
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
type Share = { id: string; userId: string; productId: string | null; fromMonth: string; toMonth: string; amountPaise: number; qty: number | null; sharePaise: number; shareQty: number | null };
const build = (more: Share[] = []) =>
  new SecondarySheetReport(
    { async listTargetShares(ids) { return [...(ids.includes('mr1') ? [{ id: 't', userId: 'mr1', productId: 'p1', fromMonth: '2026-04', toMonth: '2026-06', amountPaise: 0, qty: 90, sharePaise: 0, shareQty: 90 }, { id: 'g', userId: 'mr1', productId: null, fromMonth: '2026-04', toMonth: '2027-03', amountPaise: 500_000, qty: null, sharePaise: 0, shareQty: null }] : []), ...more.filter((m) => ids.includes(m.userId))]; } },
    { async listNames() { return { distributors: [], chemists: [], products: [{ id: 'p1', name: 'NEEDPRO BN', sku: '02', ptrPaise: 0, ptsPaise: 50_000 }, { id: 'p2', name: 'ALBU', sku: '01', ptrPaise: 0, ptsPaise: null }] }; }, async listAssignedDoctors() { return []; }, async listActiveOutlets() { return { distributors: [], chemists: [] }; }, async listDistributorAssignees() { return []; } },
    {
      async getUserSummaries() { return []; },
      async listFieldEmployees(only) { return people.filter((p) => !only || only.includes(p.id)).map((p) => ({ ...p, hqId: null, zoneId: null })); },
      async getDownline(id) { return id === 'asm' ? [{ id: 'mr1' }, { id: 'mr2' }] : []; },
      async getDesignationLevels(ids) { return ids.map((userId) => ({ userId, level: userId === 'asm' ? 2 : 1 })); },
    },
    config,
    new MrStockFigures({ listSecondaryLines: async (f) => lines.filter((l) => (!f.userIds || f.userIds.includes(l.userId)) && l.month >= f.fromMonth && l.month <= f.toMonth) }),
    () => new Date('2026-11-18T05:00:00Z'),
  );
const asAdmin = { id: 'admin', role: 'ADMIN' };

describe('one employee’s Secondary Sales sheet data', () => {
  it('an MR: a row for every product with a target or sales (targets in units per month, approved secondary, last year for growth)', async () => {
    const m = await build().read({ actor: asAdmin, userId: 'mr1', year: 2026 });
    expect(m.label).toBe('2026-27');
    expect(m.person).toMatchObject({ kind: 'MR', code: 'MR1', members: 1 });
    expect(m.person.rows).toHaveLength(1);
    expect(m.person.rows[0]).toMatchObject({ name: 'NEEDPRO BN', nsrPaise: 50_000, tgt: [30, 30, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0], prevSec: 60 });
    expect(m.person.rows[0]!.sec.slice(0, 3)).toEqual([50, 40, 0]);
  });

  it('sold outside the targeted products still gets its row, so the total is whole', async () => {
    const m = await build().read({ actor: asAdmin, userId: 'mr2', year: 2026 });
    expect(m.person.rows.map((r) => [r.name, r.tgt.every((v) => v === 0), r.sec.reduce((a, b) => a + b, 0)])).toEqual([['ALBU', true, 7], ['NEEDPRO BN', true, 10]]);
  });

  it('a manager is the sum of the MRs below them', async () => {
    const m = await build().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'asm', year: 2026 });
    expect(m.person).toMatchObject({ kind: 'TEAM', code: 'ASM1', members: 2 });
    expect(m.person.rows.map((r) => r.name)).toEqual(['ALBU', 'NEEDPRO BN']);
    expect(m.person.rows.find((r) => r.name === 'NEEDPRO BN')!.sec[0]).toBe(60);
  });

  it('no year means the financial year that holds today', async () => {
    expect((await build().read({ actor: asAdmin, userId: 'mr1' })).label).toBe('2026-27');
  });

  it('who may ask: the office anyone, an employee themselves, a manager their downline, nobody else', async () => {
    await expect(build().read({ actor: { id: 'mr1', role: 'FIELD' }, userId: 'mr1', year: 2026 })).resolves.toBeTruthy();
    await expect(build().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'mr2', year: 2026 })).resolves.toBeTruthy();
    await expect(build().read({ actor: { id: 'asm', role: 'FIELD' }, userId: 'other', year: 2026 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(build().read({ actor: { id: 'mr1', role: 'FIELD' }, userId: 'mr2', year: 2026 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(build().read({ actor: { id: 'x', role: 'EMPLOYEE' as never }, userId: 'mr1', year: 2026 })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('targets set in rupees', () => {
  const rupees = (userId: string, productId: string | null, qty: number | null, sharePaise: number): Share => ({ id: `r-${userId}-${productId}`, userId, productId, fromMonth: '2026-04', toMonth: '2027-03', amountPaise: sharePaise, qty, sharePaise, shareQty: qty });

  it('an all-products target and a product target with no quantity are kept in rupees per month, not dropped', async () => {
    const m = await build([rupees('mr1', null, null, 12_000_000), rupees('mr1', 'p2', null, 2_400_000)]).read({ actor: asAdmin, userId: 'mr1', year: 2026 });
    expect(m.person.rupeeTargetPaise).toEqual(months.map(() => 1_200_000));
    expect(m.person.rows.map((r) => r.productId)).toEqual(['p1']);
  });

  it('a manager adds up the rupee targets of the MRs below', async () => {
    const m = await build([rupees('mr1', null, null, 1_200_000), rupees('mr2', null, null, 2_400_000)]).read({ actor: asAdmin, userId: 'asm', year: 2026 });
    expect(m.person.rupeeTargetPaise).toEqual(months.map(() => 300_000));
  });

  it('is nothing without such a target', async () => {
    const m = await build().read({ actor: asAdmin, userId: 'mr1', year: 2026 });
    expect(m.person.rupeeTargetPaise).toEqual(months.map(() => 0));
  });

  it('the workbook has a row of its own for it, and the grand total and % ACH count it', async () => {
    const model = await build([rupees('mr1', null, null, 12_000_000)]).read({ actor: asAdmin, userId: 'mr1', year: 2026 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSecondarySheetWorkbook(model)) as never);
    const ws = wb.getWorksheet('Ravi')!;
    expect(ws.getCell('B7').value).toBe('TARGET SET IN ₹ (not by product)');
    expect(ws.getCell('C7').value).toBeNull();
    // 1,20,000 a year of this target in rupees: 10,000 a month. J = April's TGT.
    expect(ws.getCell('J7').value).toBe(10_000);
    expect(ws.getCell('K7').value).toBe(0);
    expect(ws.getCell('D7').value).toMatchObject({ result: 120_000 });
    // The grand total is on the row below: product target 45,000 in the first quarter plus 1,20,000, in lakh.
    expect(ws.getCell('B8').value).toBe('GRAND TOTAL (₹ lakh)');
    expect((ws.getCell('D8').value as { result: number }).result).toBeCloseTo((45_000 + 120_000) / 100_000, 6);
  });

  it('a sheet with no rupee target has no extra row', async () => {
    const model = await build().read({ actor: asAdmin, userId: 'mr1', year: 2026 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSecondarySheetWorkbook(model)) as never);
    expect(wb.getWorksheet('Ravi')!.getCell('B7').value).toBe('GRAND TOTAL (₹ lakh)');
  });
});

describe('the workbook', () => {
  it('is one sheet laid out like the company’s file, with figures that add up', async () => {
    const model = await build().read({ actor: asAdmin, userId: 'mr1', year: 2026 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSecondarySheetWorkbook(model)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ravi']);
    const ws = wb.getWorksheet('Ravi')!;
    expect(ws.getCell('A1').value).toBe('2026-27 Performance Sheet');
    expect(ws.getCell('J4').value).toBe("APRIL '26");
    expect(ws.getCell('V4').value).toBe('QTR - 1');
    expect(ws.getCell('AP4').value).toBe('1ST HALF');
    expect(ws.getCell('CD4').value).toBe('ANNUAL 2026 - 27');
    expect(ws.getCell('B6').value).toBe('NEEDPRO BN');
    expect(ws.getCell('C6').value).toBe(500);
    // Every figure is in rupees (units x N.S.R. 500). April: target 30 units = 15,000, secondary 50 units = 25,000; the first quarter adds April to June.
    expect(ws.getCell('J6').value).toBe(15_000);
    expect(ws.getCell('K6').value).toBe(25_000);
    // The % ACH sits right beside its own SEC; the spare column after it separates it from the next month.
    expect(ws.getCell('L5').value).toBe('% ACH');
    expect((ws.getCell('L6').value as { result: number }).result).toBeCloseTo(166.67, 1);
    expect(ws.getCell('M6').value).toBeNull();
    expect(ws.getCell('V6').value).toMatchObject({ result: 45_000 });
    expect(ws.getCell('W6').value).toMatchObject({ result: 45_000 });
    expect(ws.getCell('E6').value).toMatchObject({ result: 45_000 });
    // The year before gave 60 units (30,000 at the same N.S.R.), so growth is (45,000 / 30,000 - 1) x 100 = 50 %.
    expect((ws.getCell('H6').value as { result: number }).result).toBeCloseTo(50, 5);
    // Grand total in rupees lakh: 90 units x Rs 500 / 1,00,000 = 0.45.
    expect(ws.getCell('B7').value).toBe('GRAND TOTAL (₹ lakh)');
    expect((ws.getCell('E7').value as { result: number }).result).toBeCloseTo(0.45, 6);
    expect(colName(85)).toBe('CG');
  });

  it('a manager’s sheet says how many MRs it adds up', async () => {
    const model = await build().read({ actor: asAdmin, userId: 'asm', year: 2026 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSecondarySheetWorkbook(model)) as never);
    const ws = wb.getWorksheet('Anita')!;
    expect(ws.getCell('A2').value).toBe('NAME OF THE MANAGER:');
    expect(ws.getCell('C3').value).toBe(2);
    // In rupees: NEEDPRO BN 100 units x 500 = 50,000. ALBU has no N.S.R., so it cannot be priced and shows 0.
    const cell = (r: number) => ((ws.getCell(`E${r}`).value as { result?: number } | null)?.result ?? 0);
    expect([6, 7].map((r) => [ws.getCell(`B${r}`).value, cell(r)])).toEqual([['ALBU', 0], ['NEEDPRO BN', 50_000]]);
  });
});
