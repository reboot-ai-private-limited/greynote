import ExcelJS from 'exceljs';
import { monthTitle } from './employeeMonthlyWorkXlsx.js';
import type { TourPlanModel } from './tourPlanReport.js';

const BLUE = 'FF1F4E79';
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const GREY: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };

/** Column widths are fixed, and the date is a real date with a format that fits its column, so a spreadsheet never shows #### there. */
const COLUMNS: Array<{ header: string; width: number }> = [
  { header: 'Date', width: 14 },
  { header: 'Day', width: 8 },
  { header: 'Work type', width: 22 },
  { header: 'Trip', width: 12 },
  { header: 'Routes', width: 48 },
  { header: 'From', width: 24 },
  { header: 'To', width: 24 },
  { header: 'Work with', width: 28 },
  { header: 'Remarks', width: 30 },
];

/** The Tour Plan workbook: a title, then one row for every day of the month. The same file on the phone and the web. */
export async function buildTourPlanWorkbook(m: TourPlanModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greynote';
  wb.created = new Date();
  const ws = wb.addWorksheet('Tour Plan');
  ws.getCell('A1').value = `Tour Plan · ${monthTitle(m.month)}`;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  ws.getCell('A2').value = `${m.employee.name} · ${m.employee.employeeCode}${m.employee.designation ? ` · ${m.employee.designation}` : ''}`;
  ws.getCell('A2').font = { bold: true, size: 12 };
  COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const cell = ws.getCell(4, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.border = THIN;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  m.rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    row.values = [new Date(`${r.date}T00:00:00Z`), r.weekday, r.workType, r.trip, r.routes, r.from, r.to, r.workWith, r.remarks];
    row.getCell(1).numFmt = 'dd mmm yyyy';
    row.getCell(1).alignment = { horizontal: 'left' };
    row.eachCell((c) => {
      c.border = THIN;
      c.alignment = { ...c.alignment, vertical: 'top', wrapText: true };
    });
    // A day with no entry (weekly off, holiday, not planned) is greyed.
    if (r.routes === '' && r.trip === '' && /^(Weekly off|Holiday|Not planned)/.test(r.workType)) row.eachCell((c) => { c.fill = GREY; });
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
