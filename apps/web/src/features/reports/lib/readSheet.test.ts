import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { evaluateFormula, plainValue, readSheets } from './readSheet';

async function read(fill: (ws: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  fill(wb.addWorksheet('S'));
  const buf = await wb.xlsx.writeBuffer();
  return (await readSheets(new Blob([buf])))[0]!;
}
const texts = (rows: { text: string }[][]) => rows.flat().map((c) => c.text);

describe('readSheets', () => {
  it('shows a formula\'s stored answer, a zero included, and keeps plain cells, dates and merges', async () => {
    const sheet = await read((ws) => {
      ws.getCell('A1').value = 5;
      ws.getCell('B1').value = { formula: 'SUM(A1:A2)', result: 12 };
      ws.getCell('C1').value = { formula: 'A1-A1', result: 0 };
      ws.getCell('D1').value = new Date(Date.UTC(2026, 10, 3));
      ws.getCell('E1').value = 'x';
      ws.mergeCells('E1:F1');
    });
    expect(sheet.rows[0]!.map((c) => c.text).slice(0, 5)).toEqual(['5', '12', '0', '03-Nov-2026', 'x']);
    expect(sheet.rows[0]![4]).toMatchObject({ colSpan: 2 });
    expect(sheet.rows[0]![5]!.covered).toBe(true);
  });

  it('works out a formula the file stored no answer for', async () => {
    const sheet = await read((ws) => {
      ws.getCell('A1').value = 100;
      ws.getCell('B1').value = 50;
      ws.getCell('C1').value = 25;
      ws.getCell('D1').value = { formula: 'SUM(A1:C1)' } as never;
      ws.getCell('E1').value = { formula: 'A1+B1+C1' } as never;
      ws.getCell('F1').value = { formula: 'IF(A1=0,0,B1/A1*100)' } as never;
      ws.getCell('G1').value = { formula: 'D1' } as never;
      ws.getCell('H1').value = { formula: 'SUM(A1:C1)/100000', } as never;
      ws.getCell('H1').numFmt = '0.00';
    });
    expect(texts(sheet.rows).slice(3, 8)).toEqual(['175', '175', '50', '175', '0.00']);
  });

  it('shows a dash for a divide by zero and never an object', async () => {
    const sheet = await read((ws) => {
      ws.getCell('A1').value = 0;
      ws.getCell('B1').value = { formula: '5/A1' } as never;
      ws.getCell('C1').value = { formula: 'FOO(A1)' } as never;
    });
    expect(sheet.rows[0]!.map((c) => c.text)).toEqual(['0', '—', '—']);
    expect(texts(sheet.rows).join('')).not.toContain('[object');
  });
});

describe('evaluateFormula', () => {
  const grid: Record<string, number> = { '1:1': 100, '1:2': 40, '2:1': 60, '2:2': 0 };
  const raw = (r: number, c: number) => grid[`${r}:${c}`];
  it('adds a range, a chain, a growth percentage and a comparison', () => {
    expect(evaluateFormula('SUM(A1:B2)', raw)).toBe(200);
    expect(evaluateFormula('(A1/A2-1)*100', raw)).toBeCloseTo(66.67, 1);
    expect(evaluateFormula('IF(B2=0,0,A1/B2)', raw)).toBe(0);
  });
  it('refuses anything it does not know', () => {
    expect(evaluateFormula('cmd()', raw)).toBeNull();
    expect(evaluateFormula('EVAL(A1)', raw)).toBeNull();
  });
});

describe('plainValue', () => {
  it('never returns an object as text', () => {
    expect(plainValue({ weird: true }).text).toBe('');
    expect(plainValue({ formula: 'SUM(A1:A2)' }).text).toBe('—');
  });
});
