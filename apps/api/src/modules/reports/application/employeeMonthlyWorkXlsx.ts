import ExcelJS from 'exceljs';
import type { EmployeeMonthlyWorkModel } from './employeeMonthlyWorkReport.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
const dayText = (iso: string) => `${Number(iso.slice(8))} ${SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const BLUE = 'FF1F4E79';
const RED = 'FFC00000';
const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const AMBER_FILL = solid('FFFFE699');
const RED_FILL = solid('FFF8CBAD');
const GREEN_FILL = solid('FFC6E0B4');
const GREY_FILL = solid('FFEDEDED');
const HEAD_FILL = solid(BLUE);
const PAID_LEAVE_FILL = solid('FFDDEBF7');
const UNPAID_LEAVE_FILL = solid('FFF4B084');
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const rupees = (paise: number) => paise / 100;

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

const EXPENSE_STATE: Record<string, { text: string; fill: ExcelJS.Fill }> = {
  DRAFT: { text: 'Not sent yet', fill: AMBER_FILL },
  SUBMITTED: { text: 'Waiting for approval', fill: AMBER_FILL },
  APPROVED: { text: 'Approved', fill: GREEN_FILL },
  REJECTED: { text: 'Sent back', fill: RED_FILL },
};

/** The Monthly Work workbook: Daily (a row for every day of the month), Overview (the month at a glance) and Doctors (every doctor with a visit target). */
export async function buildMonthlyWorkWorkbook(m: EmployeeMonthlyWorkModel): Promise<Buffer> {
  const { employee, work } = m;
  const o = work.overview;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greynote';
  wb.created = new Date();
  const who = `${employee.name} · ${employee.employeeCode}${employee.designation ? ` · ${employee.designation}` : ''}`;
  const label = `${employee.name} · ${monthTitle(work.month)} · FY ${m.financialYear}`;
  const state = EXPENSE_STATE[m.expenseMonth.status] ?? EXPENSE_STATE['DRAFT']!;

  // ── Daily ───────────────────────────────────────────────────────────────────────────────────────────────
  const dy = wb.addWorksheet('Daily');
  title(dy, label, who);
  const cols = ['Date', 'Day', 'Kind of day', 'Tour Plan route', 'Daily Plan route', 'Changed from Tour Plan', 'DCR submitted', 'DCR status', 'Doctor calls', 'Planned', 'Missed', 'Carried in (+prev)', 'Carried total', 'Follow-ups', 'Chemist calls', 'Orders', 'Orders ₹', 'TA ₹', 'DA ₹', 'Other ₹', 'Total expenses ₹', 'Visited (names)', 'Missed (names)', 'Remarks'];
  head(dy, 4, cols);
  const first = 5;
  work.rows.forEach((d, i) => {
    const row = first + i;
    const dayOff = ['Weekly off', 'Holiday', 'Paid leave', 'Unpaid leave'].includes(d.kind);
    const dcr = dayOff ? '–' : d.dcrSubmitted ? 'Yes' : 'No';
    const remarks = [d.remarks, d.expenseNotes ? `Own claim: ${d.expenseNotes}` : '', d.expenseFlagged ? 'Distance not worked out: TA is low' : ''].filter(Boolean).join(' · ');
    const values: (string | number | { formula: string; result: number } | null)[] = [dayText(d.date), d.weekday, d.kind, d.tourWords ?? '', d.dailyWords ?? (d.planStatus === 'DRAFT' ? 'Not sent' : ''), d.changed === null ? '' : d.changed ? 'Yes' : 'No', dcr, d.dcrSubmitted ? d.report : '', d.doctorCalls, d.planned, d.missed, d.carriedIn, d.carriedTotal, d.followups, d.chemistCalls, d.orders, rupees(d.ordersPaise), rupees(d.taPaise), rupees(d.daPaise), rupees(d.otherPaise), { formula: `SUM(R${row}:T${row})`, result: rupees(d.taPaise + d.daPaise + d.otherPaise) }, d.visitedNames.join(', '), d.missedNames.join(', '), remarks];
    values.forEach((v, c) => {
      const cell = dy.getCell(row, c + 1);
      cell.value = v;
      cell.border = THIN;
      if (d.kind === 'Weekly off' || d.kind === 'Holiday') cell.fill = GREY_FILL;
      else if (d.kind === 'Paid leave') cell.fill = PAID_LEAVE_FILL;
      else if (d.kind === 'Unpaid leave') cell.fill = UNPAID_LEAVE_FILL;
    });
    for (const c of [17, 18, 19, 20, 21]) dy.getCell(row, c).numFmt = '#,##0.00';
    dy.getCell(row, 3).font = { bold: true };
    if (d.kind === 'Absent') dy.getCell(row, 3).fill = RED_FILL;
    if (d.kind === 'Worked') dy.getCell(row, 3).fill = GREEN_FILL;
    if (dcr === 'No' && d.kind !== 'Weekly off') dy.getCell(row, 7).fill = RED_FILL;
    if ((d.missed ?? 0) > 0) {
      dy.getCell(row, 11).fill = RED_FILL;
      dy.getCell(row, 11).font = { bold: true, color: { argb: RED } };
      dy.getCell(row, 23).font = { color: { argb: RED } };
    }
    if ((d.carriedIn ?? 0) > 0) dy.getCell(row, 12).fill = AMBER_FILL;
    if ((d.carriedTotal ?? 0) > 0) dy.getCell(row, 13).fill = AMBER_FILL;
    if (d.expenseFlagged) dy.getCell(row, 18).fill = RED_FILL;
  });
  const last = first + work.rows.length - 1;
  const totalRow = last + 1;
  dy.getCell(totalRow, 1).value = 'TOTAL';
  const sumCols = [9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21];
  const sumOf = (c: number): number =>
    work.rows.reduce((n, d) => n + ({ 9: d.doctorCalls, 10: d.planned ?? 0, 11: d.missed ?? 0, 14: d.followups, 15: d.chemistCalls, 16: d.orders, 17: rupees(d.ordersPaise), 18: rupees(d.taPaise), 19: rupees(d.daPaise), 20: rupees(d.otherPaise), 21: rupees(d.taPaise + d.daPaise + d.otherPaise) }[c as 9] ?? 0), 0);
  for (const c of sumCols) {
    const letter = String.fromCharCode(64 + c);
    dy.getCell(totalRow, c).value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: sumOf(c) };
    if (c >= 17) dy.getCell(totalRow, c).numFmt = '#,##0.00';
  }
  dy.getCell(totalRow, 13).value = o.doctors.carriedAtEnd;
  for (let c = 1; c <= cols.length; c++) {
    dy.getCell(totalRow, c).font = { bold: true, color: { argb: BLUE } };
    dy.getCell(totalRow, c).fill = GREY_FILL;
    dy.getCell(totalRow, c).border = THIN;
  }
  dy.getCell(totalRow + 2, 1).value = 'Doctor calls count only when the DCR was sent and approved. Carried = a doctor planned earlier and not called since; "(+prev)" includes those carried from earlier days. Carried total on the last row is what is still owed at the month end. A sent DCR always makes the day Worked.';
  dy.getCell(totalRow + 2, 1).font = { italic: true, color: { argb: 'FF666666' } };
  [13, 6, 14, 22, 22, 12, 10, 11, 9, 9, 9, 12, 10, 10, 10, 8, 12, 11, 11, 11, 14, 34, 34, 40].forEach((w, i) => (dy.getColumn(i + 1).width = w));
  dy.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }];

  // ── Overview ────────────────────────────────────────────────────────────────────────────────────────────
  const ov = wb.addWorksheet('Overview');
  title(ov, `${label} · overview`, who);
  let r = 4;
  const section = (name: string) => {
    ov.getCell(r, 1).value = name;
    ov.getCell(r, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (const c of [1, 2]) ov.getCell(r, c).fill = HEAD_FILL;
    r += 1;
  };
  const line = (name: string, value: string | number, fill?: ExcelJS.Fill, bold = false, money = false) => {
    ov.getCell(r, 1).value = name;
    ov.getCell(r, 2).value = value;
    ov.getCell(r, 2).alignment = { horizontal: 'right' };
    if (money) ov.getCell(r, 2).numFmt = '#,##0.00';
    if (bold) ov.getCell(r, 2).font = { bold: true };
    if (fill) ov.getCell(r, 2).fill = fill;
    for (const c of [1, 2]) ov.getCell(r, c).border = THIN;
    r += 1;
  };
  section('Days');
  line('Days in the month', o.days.total);
  line('Worked', o.days.worked, GREEN_FILL, true);
  line('Weekly off', o.days.weeklyOff, GREY_FILL);
  line('Holiday', o.days.holiday, GREY_FILL);
  line('Paid leave', o.days.paidLeave, PAID_LEAVE_FILL);
  line('Unpaid leave', o.days.unpaidLeave, UNPAID_LEAVE_FILL);
  line('Absent', o.days.absent, o.days.absent > 0 ? RED_FILL : undefined);
  line('DCR sent', o.reports.sent);
  line('Worked days with no DCR sent', o.reports.notSent, o.reports.notSent > 0 ? RED_FILL : undefined);
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
  line('Orders value ₹', rupees(o.orders.paise), undefined, false, true);
  r += 1;
  section('Expenses');
  line('The month', state.text, state.fill);
  line('TA ₹', rupees(o.expenses.taPaise), undefined, false, true);
  line('DA ₹', rupees(o.expenses.daPaise), undefined, false, true);
  line('Other claims ₹', rupees(o.expenses.otherPaise), undefined, false, true);
  line('Total expenses ₹', rupees(o.expenses.totalPaise), undefined, true, true);
  line('Paid so far ₹', rupees(m.expenseMonth.paidPaise), undefined, false, true);
  line('Still to pay ₹', rupees(Math.max(0, o.expenses.totalPaise - m.expenseMonth.paidPaise)), undefined, false, true);
  r += 1;
  if (o.routes.length > 0) {
    section('By route (days reported, doctor calls)');
    for (const x of o.routes) line(x.name, `${x.days} days · ${x.doctorCalls} calls`);
  }
  ov.getColumn(1).width = 52;
  ov.getColumn(2).width = 24;

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
