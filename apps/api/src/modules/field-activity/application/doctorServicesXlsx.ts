import ExcelJS from 'exceljs';
import type { DoctorServiceView } from './usecases/servicesAndGifts.usecase.js';
import { DOCTOR_SERVICE_TYPES, LEGACY_DOCTOR_SERVICE_TYPES, serviceTypeTitle, type DoctorServiceType } from '../domain/serviceGift.entity.js';
import type { ServiceSummary } from '../domain/serviceSummary.js';

const BLUE = 'FF1F4E79';
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const MONEY = '#,##0.00';
const rupees = (paise: number) => paise / 100;
const STATUS_TEXT: Record<string, string> = { SUBMITTED: 'Waiting', MANAGER_APPROVED: 'Approved', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', REOPENED: 'Reopened', DRAFT: 'Not sent' };
const dayText = (d: Date) => d.toISOString().slice(0, 10);

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

export interface DoctorServicesReportModel {
  /** "Mine", "Team of Asha", "Everyone": what the figures cover, for the sheet's heading. */
  label: string;
  summary: ServiceSummary;
  requests: DoctorServiceView[];
}

/**
 * The Doctor Services workbook (decision-log 2026-11-19): "By doctor" has one row per doctor with the approved amount by type, what is waiting and what is
 * carried out, and a grand-total row; "Requests" lists every request with a total of the ones that count. Money is in rupees; the total rows are formulas
 * with their values stored, so the file reads the same in any viewer.
 */
export async function buildDoctorServicesWorkbook(m: DoctorServicesReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const types: DoctorServiceType[] = [...DOCTOR_SERVICE_TYPES];
  const legacyUsed = LEGACY_DOCTOR_SERVICE_TYPES.filter((t) => m.summary.totals.approvedByType[t] > 0);
  const columns = [...types, ...legacyUsed];

  const by = wb.addWorksheet('By doctor');
  by.getCell('A1').value = 'Doctor services by doctor';
  by.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  by.getCell('A2').value = m.label;
  by.getCell('A2').font = { bold: true };
  const labels = ['#', 'Doctor', 'MR', 'Requests', ...columns.map((t) => serviceTypeTitle(t)), 'Approved total (₹)', 'Waiting (₹)', 'Carried out (₹)'];
  head(by, 4, labels);
  const first = 5;
  m.summary.doctors.forEach((d, i) => {
    const r = first + i;
    const cells: Array<string | number> = [i + 1, d.doctorName, d.mrNames.join(', '), d.requests, ...columns.map((t) => rupees(d.approvedByType[t])), 0, rupees(d.waitingPaise), rupees(d.donePaise)];
    cells.forEach((v, c) => {
      const cell = by.getCell(r, c + 1);
      cell.value = v;
      cell.border = THIN;
      if (c >= 4) cell.numFmt = MONEY;
    });
    const firstType = 5;
    const lastType = 4 + columns.length;
    by.getCell(r, lastType + 1).value = { formula: `SUM(${by.getCell(r, firstType).address}:${by.getCell(r, lastType).address})`, result: rupees(d.approvedPaise) };
  });
  const lastRow = first + m.summary.doctors.length - 1;
  const totalRow = lastRow + 1;
  const totalCells = [1, 2, 3, 4, ...columns.map((_, i) => 5 + i), 5 + columns.length, 6 + columns.length, 7 + columns.length];
  totalCells.forEach((c) => {
    const cell = by.getCell(totalRow, c);
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true };
    cell.border = THIN;
    if (c >= 5) cell.numFmt = MONEY;
  });
  by.getCell(totalRow, 2).value = 'TOTAL';
  const sum = (col: number, result: number) => ({ formula: m.summary.doctors.length > 0 ? `SUM(${by.getCell(first, col).address}:${by.getCell(lastRow, col).address})` : '0', result });
  by.getCell(totalRow, 4).value = sum(4, m.summary.totals.requests);
  columns.forEach((t, i) => (by.getCell(totalRow, 5 + i).value = sum(5 + i, rupees(m.summary.totals.approvedByType[t]))));
  by.getCell(totalRow, 5 + columns.length).value = sum(5 + columns.length, rupees(m.summary.totals.approvedPaise));
  by.getCell(totalRow, 6 + columns.length).value = sum(6 + columns.length, rupees(m.summary.totals.waitingPaise));
  by.getCell(totalRow, 7 + columns.length).value = sum(7 + columns.length, rupees(m.summary.totals.donePaise));
  by.columns.forEach((c, i) => (c.width = i === 1 ? 28 : i === 2 ? 24 : 14));
  by.views = [{ state: 'frozen', ySplit: 4 }];

  const rq = wb.addWorksheet('Requests');
  rq.getCell('A1').value = 'Doctor service requests';
  rq.getCell('A1').font = { bold: true, size: 16, color: { argb: BLUE } };
  rq.getCell('A2').value = m.label;
  rq.getCell('A2').font = { bold: true };
  head(rq, 4, ['#', 'Date', 'Doctor', 'MR', 'Service', 'Amount (₹)', 'Status', 'Carried out', 'Remarks']);
  m.requests.forEach((s, i) => {
    const r = 5 + i;
    [i + 1, dayText(s.createdAt), s.doctorName, s.userName ?? '', serviceTypeTitle(s.serviceType), rupees(s.amountPaise), STATUS_TEXT[s.status] ?? s.status, s.doneAt ? dayText(s.doneAt) : '', s.remarks ?? ''].forEach((v, c) => {
      const cell = rq.getCell(r, c + 1);
      cell.value = v;
      cell.border = THIN;
      if (c === 5) cell.numFmt = MONEY;
    });
  });
  const counted = m.requests.filter((s) => s.status === 'APPROVED' || s.status === 'MANAGER_APPROVED').reduce((a, s) => a + s.amountPaise, 0);
  const rqTotal = 5 + m.requests.length;
  rq.getCell(rqTotal, 5).value = 'Approved total';
  rq.getCell(rqTotal, 6).value = {
    formula: m.requests.length > 0 ? `SUMIF(${rq.getCell(5, 7).address}:${rq.getCell(rqTotal - 1, 7).address},"Approved",${rq.getCell(5, 6).address}:${rq.getCell(rqTotal - 1, 6).address})` : '0',
    result: rupees(counted),
  };
  [5, 6].forEach((c) => {
    const cell = rq.getCell(rqTotal, c);
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
    cell.border = THIN;
    if (c === 6) cell.numFmt = MONEY;
  });
  rq.columns.forEach((c, i) => (c.width = i === 2 || i === 3 ? 26 : i === 8 ? 40 : 15));
  rq.views = [{ state: 'frozen', ySplit: 4 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
