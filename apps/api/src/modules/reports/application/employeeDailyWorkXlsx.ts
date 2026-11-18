import ExcelJS from 'exceljs';
import type { EmployeeDailyWorkModel } from './employeeDailyWorkReport.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

const BLUE = 'FF1F4E79';
const RED = 'FFC00000';
const AMBER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
const RED_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
const GREEN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };
const GREY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

const head = (ws: ExcelJS.Worksheet, row: number, labels: string[]) => {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEAD_FILL;
    c.border = THIN;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
};

const title = (ws: ExcelJS.Worksheet, text: string, who: string) => {
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  ws.getCell('A2').value = who;
  ws.getCell('A2').font = { bold: true, size: 12 };
};

/** The Daily Work workbook: Overview, Daily (a row a day) and Doctors (every doctor with a visit target). */
export async function buildDailyWorkWorkbook(m: EmployeeDailyWorkModel): Promise<Buffer> {
  const { employee, work } = m;
  const o = work.overview;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greynote';
  wb.created = new Date();
  const who = `${employee.name} · ${employee.employeeCode}${employee.designation ? ` · ${employee.designation}` : ''}`;
  const label = `Daily Work report · ${monthTitle(work.month)}`;

  // ── Overview ────────────────────────────────────────────────────────────────────────────────────────────
  const ov = wb.addWorksheet('Overview');
  title(ov, label, who);
  let r = 4;
  const section = (name: string) => {
    ov.getCell(r, 1).value = name;
    ov.getCell(r, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (const c of [1, 2]) ov.getCell(r, c).fill = HEAD_FILL;
    r += 1;
  };
  const line = (name: string, value: string | number, fill?: ExcelJS.Fill, bold = false) => {
    ov.getCell(r, 1).value = name;
    ov.getCell(r, 2).value = value;
    ov.getCell(r, 2).alignment = { horizontal: 'right' };
    if (bold) ov.getCell(r, 2).font = { bold: true };
    if (fill) ov.getCell(r, 2).fill = fill;
    for (const c of [1, 2]) ov.getCell(r, c).border = THIN;
    r += 1;
  };
  section('Days');
  line('Days in the month', o.days.total);
  line('Days worked', o.days.worked, GREEN_FILL);
  line('On leave', o.days.leave);
  line('Weekly off / holiday', o.days.weeklyOff + o.days.holiday);
  line('Absent', o.days.absent, o.days.absent > 0 ? RED_FILL : undefined);
  line('Reports sent', o.reports.sent);
  line('Worked days with no report sent', o.reports.notSent, o.reports.notSent > 0 ? RED_FILL : undefined);
  r += 1;
  section('Doctors on the Daily Plans');
  line('Doctor visits planned (doctor-days)', o.doctors.plannedDays);
  line('Visited', o.doctors.visited, GREEN_FILL);
  line('Missed on the day', o.doctors.missed, o.doctors.missed > 0 ? RED_FILL : undefined);
  line(work.countedThrough < `${work.month}-28` ? 'Carried over now (planned, not called since)' : 'Carried at month end (planned, not called since)', o.doctors.carriedAtEnd, o.doctors.carriedAtEnd > 0 ? AMBER_FILL : undefined, true);
  line('Also visited (not planned)', o.doctors.alsoVisited);
  r += 1;
  section('Visit targets');
  line('Doctors with a monthly visit target', o.targets.withTarget);
  line('Visits wanted', o.targets.quota);
  line('Visits made (each doctor capped at the target)', o.targets.made, GREEN_FILL);
  line('Missed visits', o.targets.missed, o.targets.missed > 0 ? RED_FILL : undefined, true);
  line('Doctors not called at all this month', o.targets.notCalled, o.targets.notCalled > 0 ? RED_FILL : undefined, true);
  r += 1;
  section('Calls and orders');
  line('Doctor calls', o.calls.doctor);
  line('Chemist calls', o.calls.chemist);
  line('Follow-ups', o.calls.followups);
  line('Location checks: ok / failed / other', `${o.location.pass} / ${o.location.fail} / ${o.location.other}`);
  line('Orders', o.orders.count);
  line('Orders value (₹)', o.orders.paise / 100);
  ov.getCell(r - 1, 2).numFmt = '#,##0.00';
  r += 1;
  if (o.routes.length > 0) {
    section('By route (days reported, doctor calls)');
    for (const x of o.routes) line(x.name, `${x.days} days · ${x.doctorCalls} calls`);
    r += 1;
  }
  ov.getCell(r, 1).value = `Counted through ${work.countedThrough}. Only calls on a sent or approved report count; a doctor is planned only on an approved Daily Plan; a planned doctor who is not called is carried from the next day until a call. Carry-over here follows the month (the default setting).`;
  ov.getCell(r, 1).font = { italic: true, color: { argb: 'FF666666' } };
  ov.getColumn(1).width = 52;
  ov.getColumn(2).width = 22;

  // ── Daily ───────────────────────────────────────────────────────────────────────────────────────────────
  const dy = wb.addWorksheet('Daily');
  title(dy, label, who);
  const cols = ['Date', 'Day', 'Kind of day', 'Tour Plan', 'Daily Plan', 'Changed from Tour Plan', 'Works with', 'Planned', 'Visited', 'Missed', 'Carried in', 'Also visited', 'Doctor calls', 'Chemist calls', 'Follow-ups', 'Orders', 'Orders ₹', 'Report', 'Visited (names)', 'Missed (names)', 'Remarks'];
  head(dy, 4, cols);
  const first = 5;
  work.rows.forEach((d, i) => {
    const row = first + i;
    const off = ['Weekly off', 'Holiday', 'Leave', ''].includes(d.kind) && d.report === 'No report';
    const values: (string | number | null)[] = [d.date, d.weekday, d.kind, d.tourWords ?? '', d.dailyWords ?? (d.planStatus === 'DRAFT' ? 'Not sent' : ''), d.changed === null ? '' : d.changed ? 'Yes' : 'No', d.workWith.join(', '), d.planned, d.visited, d.missed, d.carriedIn, d.alsoVisited, d.doctorCalls, d.chemistCalls, d.followups, d.orders, d.ordersPaise / 100, d.report, d.visitedNames.join(', '), d.missedNames.join(', '), d.remarks ?? ''];
    values.forEach((v, c) => {
      const cell = dy.getCell(row, c + 1);
      cell.value = v;
      cell.border = THIN;
      if (off) cell.fill = GREY_FILL;
    });
    dy.getCell(row, 17).numFmt = '#,##0.00';
    if ((d.missed ?? 0) > 0) {
      dy.getCell(row, 10).fill = RED_FILL;
      dy.getCell(row, 10).font = { bold: true, color: { argb: RED } };
      dy.getCell(row, 20).font = { color: { argb: RED } };
    }
    if ((d.carriedIn ?? 0) > 0) dy.getCell(row, 11).fill = AMBER_FILL;
    if (d.report === 'No report' && d.kind === 'Worked') dy.getCell(row, 18).fill = RED_FILL;
    if (d.report === 'Approved' || d.report === 'Sent') dy.getCell(row, 18).fill = GREEN_FILL;
  });
  const last = first + work.rows.length - 1;
  const totalRow = last + 1;
  dy.getCell(totalRow, 1).value = 'TOTAL';
  for (const c of [8, 9, 10, 12, 13, 14, 15, 16, 17]) {
    const letter = String.fromCharCode(64 + c);
    const sum = work.rows.reduce((n, d) => n + Number([d.planned, d.visited, d.missed, d.alsoVisited, d.doctorCalls, d.chemistCalls, d.followups, d.orders, d.ordersPaise / 100][[8, 9, 10, 12, 13, 14, 15, 16, 17].indexOf(c)] ?? 0), 0);
    dy.getCell(totalRow, c).value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: sum };
  }
  dy.getCell(totalRow, 17).numFmt = '#,##0.00';
  for (let c = 1; c <= cols.length; c++) {
    dy.getCell(totalRow, c).font = { bold: true, color: { argb: BLUE } };
    dy.getCell(totalRow, c).fill = GREY_FILL;
    dy.getCell(totalRow, c).border = THIN;
  }
  [12, 6, 12, 22, 22, 12, 18, 9, 9, 9, 9, 9, 9, 9, 9, 8, 12, 11, 36, 36, 30].forEach((w, i) => (dy.getColumn(i + 1).width = w));
  dy.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  // ── Doctors ─────────────────────────────────────────────────────────────────────────────────────────────
  const dr = wb.addWorksheet('Doctors');
  title(dr, `${label} · doctors with a visit target`, who);
  head(dr, 4, ['Doctor', 'Visits wanted', 'Visits made', 'Missed', 'Days planned', 'Carried since', 'Last visit']);
  work.doctors.forEach((d, i) => {
    const row = 5 + i;
    [d.name, d.frequency, d.visits, d.missed, d.plannedDays, d.carriedSince ?? '', d.lastVisit ?? ''].forEach((v, c) => {
      dr.getCell(row, c + 1).value = v;
      dr.getCell(row, c + 1).border = THIN;
    });
    if (d.missed > 0) dr.getCell(row, 4).fill = RED_FILL;
    if (d.visits === 0) dr.getCell(row, 3).fill = RED_FILL;
    if (d.carriedSince) dr.getCell(row, 6).fill = AMBER_FILL;
  });
  [30, 14, 12, 10, 12, 14, 12].forEach((w, i) => (dr.getColumn(i + 1).width = w));
  dr.views = [{ state: 'frozen', ySplit: 4 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
