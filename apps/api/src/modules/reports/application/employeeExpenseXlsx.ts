import ExcelJS from 'exceljs';
import { monthTitle } from './employeeDailyWorkXlsx.js';
import type { EmployeeExpenseModel } from './employeeExpenseReport.js';

const BLUE = 'FF1F4E79';
const HEAD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
const GREY: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
const GREEN: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };
const AMBER: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
const RED: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

const STATE: Record<EmployeeExpenseModel['status'], { text: string; fill: ExcelJS.Fill }> = {
  DRAFT: { text: 'Not sent yet', fill: AMBER },
  SUBMITTED: { text: 'Waiting for approval', fill: AMBER },
  APPROVED: { text: 'Approved', fill: GREEN },
  REJECTED: { text: 'Sent back', fill: RED },
};
const rupees = (paise: number) => paise / 100;

/** The Expense workbook: Expenses (a row a day with route, TA, DA, own claims and payment) and an Overview of the month. */
export async function buildExpenseWorkbook(m: EmployeeExpenseModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greynote';
  wb.created = new Date();
  const who = `${m.employee.name} · ${m.employee.employeeCode}${m.employee.designation ? ` · ${m.employee.designation}` : ''}`;
  const label = `Expense report · ${monthTitle(m.month)}`;
  const state = STATE[m.status];

  // ── Expenses ────────────────────────────────────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Expenses');
  ws.getCell('A1').value = label;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  ws.getCell('A2').value = who;
  ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A3').value = `Month: ${state.text}${m.paidPaise > 0 ? ` · ₹${rupees(m.paidPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })} paid` : ''}`;
  ws.getCell('A3').fill = state.fill;
  ws.getCell('A3').font = { bold: true };
  const cols = ['Date', 'Route', 'TA ₹', 'DA ₹', 'Other ₹', 'Total ₹', 'Own claims (notes)', 'Payment', 'Distance flag'];
  cols.forEach((c, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = c;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEAD;
    cell.border = THIN;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  const first = 6;
  m.days.forEach((d, i) => {
    const r = first + i;
    [d.date, d.route, rupees(d.taPaise), rupees(d.daPaise), rupees(d.otherPaise), null, d.notes, d.payment, d.flagged ? 'Distance not worked out: TA is low' : ''].forEach((v, c) => {
      ws.getCell(r, c + 1).value = v;
      ws.getCell(r, c + 1).border = THIN;
    });
    ws.getCell(r, 6).value = { formula: `SUM(C${r}:E${r})`, result: rupees(d.totalPaise) };
    for (const c of [3, 4, 5, 6]) ws.getCell(r, c).numFmt = '#,##0.00';
    if (d.payment === 'Paid') ws.getCell(r, 8).fill = GREEN;
    else if (d.payment === 'Unpaid' || d.payment === 'Part paid') ws.getCell(r, 8).fill = AMBER;
    if (d.flagged) ws.getCell(r, 9).fill = RED;
  });
  const last = first + m.days.length - 1;
  const t = last + 1;
  ws.getCell(t, 1).value = 'TOTAL';
  const sums: [number, number][] = [[3, m.totals.taPaise], [4, m.totals.daPaise], [5, m.totals.otherPaise], [6, m.totals.totalPaise]];
  for (const [c, v] of sums) {
    const L = String.fromCharCode(64 + c);
    ws.getCell(t, c).value = m.days.length ? { formula: `SUM(${L}${first}:${L}${last})`, result: rupees(v) } : 0;
    ws.getCell(t, c).numFmt = '#,##0.00';
  }
  for (let c = 1; c <= cols.length; c++) {
    ws.getCell(t, c).font = { bold: true, color: { argb: BLUE } };
    ws.getCell(t, c).fill = GREY;
    ws.getCell(t, c).border = THIN;
  }
  if (m.days.length === 0) ws.getCell(first, 1).value = 'No expenses this month.';
  [12, 24, 12, 12, 12, 12, 34, 12, 34].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  // ── Overview ────────────────────────────────────────────────────────────────────────────────────────────
  const ov = wb.addWorksheet('Overview');
  ov.getCell('A1').value = label;
  ov.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  ov.getCell('A2').value = who;
  ov.getCell('A2').font = { bold: true, size: 12 };
  const lines: [string, string | number, ExcelJS.Fill?][] = [
    ['The month', state.text, state.fill],
    ['Days with a claim', m.days.length],
    ['TA ₹', rupees(m.totals.taPaise)],
    ['DA ₹', rupees(m.totals.daPaise)],
    ['Other claims ₹', rupees(m.totals.otherPaise)],
    ['Total ₹', rupees(m.totals.totalPaise)],
    ['Paid so far ₹', rupees(m.paidPaise)],
    ['Still to pay ₹', rupees(Math.max(0, m.totals.totalPaise - m.paidPaise))],
  ];
  lines.forEach(([k, v, fill], i) => {
    const r = 4 + i;
    ov.getCell(r, 1).value = k;
    ov.getCell(r, 2).value = v;
    ov.getCell(r, 2).alignment = { horizontal: 'right' };
    if (typeof v === 'number' && k.includes('₹')) ov.getCell(r, 2).numFmt = '#,##0.00';
    if (fill) ov.getCell(r, 2).fill = fill;
    for (const c of [1, 2]) ov.getCell(r, c).border = THIN;
    if (k === 'Total ₹') for (const c of [1, 2]) ov.getCell(r, c).font = { bold: true, color: { argb: BLUE } };
  });
  ov.getCell(13, 1).value = 'TA and DA come from the person\'s approved daily reports; "own claims" are what they added themselves. Payment shows once the month is approved.';
  ov.getCell(13, 1).font = { italic: true, color: { argb: 'FF666666' } };
  ov.getColumn(1).width = 34;
  ov.getColumn(2).width = 24;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
