import ExcelJS from 'exceljs';
import type { SecondarySheetModel, SheetPerson, SheetRow } from '../domain/secondarySheet.js';

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Column letters for a 1-based column number (1 = A, 27 = AA). */
export const colName = (n: number): string => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

type Block = { kind: 'month'; i: number } | { kind: 'qtr'; q: number } | { kind: 'half'; h: number } | { kind: 'annual' };

/** The order the sheet runs in, as in the company's file: three months, the quarter, three months, the quarter, the first half, … the year. */
const BLOCKS: Block[] = [
  ...[0, 1, 2].map((i): Block => ({ kind: 'month', i })), { kind: 'qtr', q: 0 },
  ...[3, 4, 5].map((i): Block => ({ kind: 'month', i })), { kind: 'qtr', q: 1 }, { kind: 'half', h: 0 },
  ...[6, 7, 8].map((i): Block => ({ kind: 'month', i })), { kind: 'qtr', q: 2 },
  ...[9, 10, 11].map((i): Block => ({ kind: 'month', i })), { kind: 'qtr', q: 3 }, { kind: 'half', h: 1 },
  { kind: 'annual' },
];

const FIRST_BLOCK_COL = 10; // J
const WIDTH = 4; // TGT, SEC, % ACH (beside its own SEC), then a narrow spare column that separates it from the next month
const HEAD_ROW = 5;
const FIRST_ROW = 6;
/** The id of the one row that holds the rupee targets, which belongs to no product. */
const RUPEE_ROW = 'RUPEE_TARGET';
const blockCol = (b: number) => FIRST_BLOCK_COL + b * WIDTH;
const pct = (sec: number, tgt: number) => (tgt > 0 ? (sec * 100) / tgt : 0);

type Pair = { tgt: number; sec: number };
/** Every block's target and secondary for one product row, worked out the same way the formulas will. */
function figures(row: Pick<SheetRow, 'tgt' | 'sec'>): Pair[] {
  const month = (i: number): Pair => ({ tgt: row.tgt[i]!, sec: row.sec[i]! });
  const add = (...ps: Pair[]): Pair => ({ tgt: ps.reduce((n, p) => n + p.tgt, 0), sec: ps.reduce((n, p) => n + p.sec, 0) });
  const q = [0, 1, 2, 3].map((k) => add(month(k * 3), month(k * 3 + 1), month(k * 3 + 2)));
  const h = [add(q[0]!, q[1]!), add(q[2]!, q[3]!)];
  const year = add(h[0]!, h[1]!);
  return BLOCKS.map((b) => (b.kind === 'month' ? month(b.i) : b.kind === 'qtr' ? q[b.q]! : b.kind === 'half' ? h[b.h]! : year));
}

const rupees = (paise: number | null) => (paise === null ? 0 : paise / 100);
/** A product's target and secondary in rupees: units × N.S.R. worked in whole paise, so no stray decimals. A product with no N.S.R. is 0. Only the grand total is in rupees. */
const pricedRow = (row: Pick<SheetRow, 'tgt' | 'sec' | 'nsrPaise'>): Pick<SheetRow, 'tgt' | 'sec'> => ({
  tgt: row.tgt.map((v) => (v * (row.nsrPaise ?? 0)) / 100),
  sec: row.sec.map((v) => (v * (row.nsrPaise ?? 0)) / 100),
});

/** The label above a block: "APRIL '26", "QTR - 1", "1ST HALF", "ANNUAL 2026 - 27". */
function blockTitle(b: Block, model: SecondarySheetModel): string {
  if (b.kind === 'month') {
    const month = model.months[b.i]!;
    return `${MONTH_NAMES[Number(month.slice(5)) - 1]} '${month.slice(2, 4)}`;
  }
  if (b.kind === 'qtr') return `QTR - ${b.q + 1}`;
  if (b.kind === 'half') return b.h === 0 ? '1ST HALF' : '2ND HALF';
  return `ANNUAL ${model.label.replace('-', ' - ')}`;
}

const range = (model: SecondarySheetModel) => {
  const first = model.months[0]!;
  const last = model.months[11]!;
  const part = (m: string) => `${SHORT[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
  return `${part(first)} - ${part(last)}`;
};

// The company's file: secondary (SEC) cells are yellow, the percentages and quarters blue, the halves and the year red, the title blue.
const BLUE = 'FF0000FF';
const RED = 'FFFF0000';
const YELLOW: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
/** The font colour of a block: months plain, quarters blue, halves and the year red. */
const colourOf = (b: Block): string | undefined => (b.kind === 'month' ? undefined : b.kind === 'qtr' ? BLUE : RED);
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

/** The first column of a month, quarter, half or year gets a heavier left edge, so where one block ends and the next begins is plain to see. */
const BLOCK_START: Partial<ExcelJS.Borders> = { ...THIN, left: { style: 'medium' } };

function writePerson(ws: ExcelJS.Worksheet, p: SheetPerson, model: SecondarySheetModel): void {
  // Targets set in rupees (for all products) have no product: they get a row of their own, priced at ₹1 a unit (N.S.R. 1) so the grand total counts it with the others.
  const rupeeRow: SheetRow | null = p.rupeeTargetPaise.some((v) => v !== 0)
    ? { productId: RUPEE_ROW, name: 'TARGET SET IN ₹ (not by product)', sku: '', nsrPaise: 100, tgt: p.rupeeTargetPaise.map((v) => v / 100), sec: p.rupeeTargetPaise.map(() => 0), prevSec: null }
    : null;
  const rows = rupeeRow ? [...p.rows, rupeeRow] : p.rows;
  const last = FIRST_ROW + rows.length - 1;
  const totalRow = last + 1;

  ws.getCell('A1').value = `${model.label} Performance Sheet`;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  ws.getCell('A2').value = p.kind === 'TEAM' ? 'NAME OF THE MANAGER:' : 'NAME OF THE BE/ BE-S HQ:';
  ws.getCell('C2').value = `${p.name} · ${p.code}${p.designation ? ` · ${p.designation}` : ''}`;
  ws.getCell('A3').value = 'NO.OF BEs/ BE-Ss :';
  ws.getCell('C3').value = p.members;
  for (const a of ['A2', 'A3']) ws.getCell(a).font = { bold: true, size: 12, color: { argb: BLUE } };
  for (const a of ['C2', 'C3']) ws.getCell(a).font = { bold: true, size: 12, color: { argb: RED } };

  // Heads.
  const head = (col: number, text: string) => {
    const c = ws.getCell(HEAD_ROW, col);
    c.value = text;
    c.font = { bold: true };
    c.fill = HEAD_FILL;
    c.border = THIN;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  head(1, 'SL.NO.');
  head(2, 'PRODUCT');
  head(3, 'N.S.R.');
  head(4, `TGT (units) ${range(model)}`);
  head(5, `ACH (units) ${range(model)}`);
  head(6, '% ACH');
  head(8, '% GR.');
  BLOCKS.forEach((b, n) => {
    const col = blockCol(n);
    const title = ws.getCell(4, col);
    title.value = blockTitle(b, model);
    title.font = { bold: true, size: 11, ...(colourOf(b) ? { color: { argb: colourOf(b)! } } : {}) };
    title.alignment = { horizontal: 'center' };
    ws.mergeCells(4, col, 4, col + 2);
    head(col, 'TGT (units)');
    head(col + 1, 'SEC (units)');
    head(col + 2, '% ACH');
    for (const c of [col, col + 1, col + 2]) if (colourOf(b)) ws.getCell(HEAD_ROW, c).font = { bold: true, color: { argb: colourOf(b)! } };
  });

  // Products.
  rows.forEach((row, k) => {
    const r = FIRST_ROW + k;
    // The product's figures are units, as the MR entered them; only the grand total is in rupees (units × N.S.R., decision-log 2026-11-22).
    const fig = figures(row);
    ws.getCell(r, 1).value = k + 1;
    ws.getCell(r, 2).value = row.name;
    ws.getCell(r, 3).value = row.nsrPaise === null ? null : rupees(row.nsrPaise);
    ws.getCell(r, 3).numFmt = '#,##0.00';
    BLOCKS.forEach((b, n) => {
      const col = blockCol(n);
      const t = colName(col);
      ws.getCell(r, col).numFmt = '#,##0';
      ws.getCell(r, col + 1).numFmt = '#,##0';
      const s = colName(col + 1);
      const pc = col + 2;
      const f = fig[n]!;
      if (b.kind === 'month') {
        ws.getCell(r, col).value = f.tgt;
        ws.getCell(r, col + 1).value = f.sec;
      } else {
        // A quarter adds its three months, a half its two quarters, the year its two halves.
        const sources = sourceBlocks(b);
        ws.getCell(r, col).value = { formula: sources.map((x) => `${colName(blockCol(x))}${r}`).join('+'), result: f.tgt };
        ws.getCell(r, col + 1).value = { formula: sources.map((x) => `${colName(blockCol(x) + 1)}${r}`).join('+'), result: f.sec };
      }
      ws.getCell(r, pc).value = { formula: `IF(${t}${r}=0,0,${s}${r}/${t}${r}*100)`, result: pct(f.sec, f.tgt) };
      ws.getCell(r, pc).numFmt = '0.0';
    });
    const year = fig[BLOCKS.length - 1]!;
    const yc = blockCol(BLOCKS.length - 1);
    ws.getCell(r, 4).numFmt = '#,##0';
    ws.getCell(r, 5).numFmt = '#,##0';
    ws.getCell(r, 4).value = { formula: `${colName(yc)}${r}`, result: year.tgt };
    ws.getCell(r, 5).value = { formula: `${colName(yc + 1)}${r}`, result: year.sec };
    ws.getCell(r, 6).value = { formula: `IF(D${r}=0,0,E${r}/D${r}*100)`, result: pct(year.sec, year.tgt) };
    ws.getCell(r, 6).numFmt = '0.0';
    // Growth on the same year before: blank when there was nothing then.
    const prevUnits = row.prevSec ?? 0;
    if (prevUnits > 0) {
      ws.getCell(r, 8).value = { formula: `(E${r}/${prevUnits}-1)*100`, result: (year.sec / prevUnits - 1) * 100 };
      ws.getCell(r, 8).numFmt = '0.0';
    }

    // Colours, as in the company's file.
    const font = (colour: string | undefined, bold: boolean): Partial<ExcelJS.Font> => ({ size: 10, bold, ...(colour ? { color: { argb: colour } } : {}) });
    BLOCKS.forEach((b, n) => {
      const col = blockCol(n);
      const colour = colourOf(b);
      ws.getCell(r, col).font = font(colour, b.kind === 'month');
      ws.getCell(r, col + 1).font = font(colour, b.kind === 'month');
      ws.getCell(r, col + 1).fill = YELLOW;
      ws.getCell(r, col + 2).font = font(colour ?? BLUE, false);
      for (const c of [col, col + 1, col + 2]) ws.getCell(r, c).border = c === col ? BLOCK_START : THIN;
    });
    ws.getCell(r, 1).font = font(undefined, true);
    ws.getCell(r, 2).font = font(undefined, true);
    ws.getCell(r, 4).font = font(undefined, true);
    ws.getCell(r, 5).font = font(RED, true);
    ws.getCell(r, 5).fill = YELLOW;
    ws.getCell(r, 6).font = font(BLUE, false);
    for (const c of [1, 2, 3, 4, 5, 6]) ws.getCell(r, c).border = THIN;
    // The row of targets set in rupees is the one row in rupees: say so with the format.
    if (row.productId === RUPEE_ROW) {
      for (const c of [4, 5, ...BLOCKS.flatMap((_, n) => [blockCol(n), blockCol(n) + 1])]) ws.getCell(r, c).numFmt = '"₹"#,##0';
    }
  });

  // Grand total, in rupees lakh: the rows above are units, so each total is the sum of units × N.S.R. / 1,00,000 (a product with no N.S.R. adds nothing).
  ws.getCell(totalRow, 2).value = 'GRAND TOTAL (₹ lakh)';
  const lakh = (pick: (f: Pair) => number): number[] =>
    BLOCKS.map((_, n) => rows.reduce((acc, row) => acc + pick(figures(pricedRow(row))[n]!), 0) / 100_000);
  const tgtLakh = lakh((f) => f.tgt);
  const secLakh = lakh((f) => f.sec);
  const sumLakh = (col: number, v: number) => {
    const c = ws.getCell(totalRow, col);
    const units = `${colName(col)}${FIRST_ROW}:${colName(col)}${last}`;
    c.value = rows.length ? { formula: `SUMPRODUCT(${units},$C$${FIRST_ROW}:$C$${last})/100000`, result: v } : 0;
    c.numFmt = '0.00';
  };
  BLOCKS.forEach((_, n) => {
    const col = blockCol(n);
    sumLakh(col, tgtLakh[n]!);
    sumLakh(col + 1, secLakh[n]!);
    const pc = ws.getCell(totalRow, col + 2);
    pc.value = { formula: `IF(${colName(col)}${totalRow}=0,0,${colName(col + 1)}${totalRow}/${colName(col)}${totalRow}*100)`, result: pct(secLakh[n]!, tgtLakh[n]!) };
    pc.numFmt = '0.0';
  });
  const yn = BLOCKS.length - 1;
  sumLakh(4, tgtLakh[yn]!);
  sumLakh(5, secLakh[yn]!);
  ws.getCell(totalRow, 6).value = { formula: `IF(D${totalRow}=0,0,E${totalRow}/D${totalRow}*100)`, result: pct(secLakh[yn]!, tgtLakh[yn]!) };
  ws.getCell(totalRow, 6).numFmt = '0.0';
  for (let c = 1; c <= blockCol(BLOCKS.length - 1) + 3; c++) {
    const cell = ws.getCell(totalRow, c);
    cell.font = { bold: true, size: 11, color: { argb: BLUE } };
    cell.fill = TOTAL_FILL;
  }

  ws.getCell(totalRow + 2, 1).value = 'TGT and SEC are in units. TGT = the target, spread evenly over the months it covers. SEC = secondary the MR sent and the manager approved; a month not approved shows 0. % GR. = this year\'s secondary units against the year before. The GRAND TOTAL row is in rupees lakh: units × N.S.R. (the product\'s PTS) added up; a product with no N.S.R. cannot be priced and adds nothing to it. A target set in rupees for all products is in its own row, in rupees (N.S.R. 1).';
  ws.getCell(totalRow + 2, 1).font = { italic: true, color: { argb: 'FF666666' } };

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 8;
  ws.getColumn(7).width = 2;
  ws.getColumn(8).width = 8;
  ws.getColumn(9).width = 2;
  for (let n = 0; n < BLOCKS.length; n++) {
    ws.getColumn(blockCol(n)).width = 8;
    ws.getColumn(blockCol(n) + 1).width = 8;
    ws.getColumn(blockCol(n) + 2).width = 8;
    ws.getColumn(blockCol(n) + 3).width = 2;
  }
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: HEAD_ROW }];
}

/** The block numbers a quarter, a half or the year adds up. */
function sourceBlocks(b: Block): number[] {
  const at = (x: Block) => BLOCKS.findIndex((y) => JSON.stringify(y) === JSON.stringify(x));
  if (b.kind === 'qtr') return [0, 1, 2].map((k) => at({ kind: 'month', i: b.q * 3 + k }));
  if (b.kind === 'half') return [at({ kind: 'qtr', q: b.h * 2 }), at({ kind: 'qtr', q: b.h * 2 + 1 })];
  return [at({ kind: 'half', h: 0 }), at({ kind: 'half', h: 1 })];
}

/** A sheet name Excel accepts: at most 31 characters, none of `[]:*?/\`, and not used twice. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** The workbook: one sheet, the employee's performance sheet, as in the company's file. */
export async function buildSecondarySheetWorkbook(model: SecondarySheetModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greynote';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName(model.person.name, new Set()));
  writePerson(ws, model.person, model);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
