import { prettyMonth } from '@/offline/day';

import type { MyPayslip, SlipLine } from './docs';
import { formatRupees } from './money';
import { slug } from './slug';

/**
 * The payslip page, laid out like the web's salary slip when it is printed or saved as a PDF (apps/web PayslipScreen, with the
 * colours of styles/theme.css): the Greynote logo on the left, the company name and ISO line in the middle, "Salary Slip for the month of
 * …" on the right, the employee, Earnings and Deductions side by side with their totals, then the footer with the net salary. The server
 * does the sums; the phone only prints them.
 *
 * It is one A4 page (`PAYSLIP_PAGE`, in points). The PDF engine lays a page out at 96 to the inch, so A4 is 794 CSS pixels wide and every
 * size below is the web's own (14px text, 12mm margins). The phone's slip carries the employee's name and code only (not the designation,
 * UAN, ESI, bank details, joining date or the days attended), so the web's other rows are left out until the server sends them.
 */

/** A4 portrait in points (72 to the inch). */
export const PAYSLIP_PAGE = { width: 595, height: 842 } as const;

const COMPANY_NAME = 'GreyNote Health Care Pvt. Ltd.';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rows = (lines: readonly SlipLine[], emptyText: string) =>
  lines.length === 0
    ? `<tr><td class="muted">${esc(emptyText)}</td><td class="amt">${formatRupees(0)}</td></tr>`
    : lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="amt">${formatRupees(l.amountPaise)}</td></tr>`).join('');

const amounts = (title: string, lines: readonly SlipLine[], totalLabel: string, total: number, emptyText: string) => `
  <section>
    <h2>${esc(title)}</h2>
    <table>
      <thead><tr><th>Particulars</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        ${rows(lines, emptyText)}
        <tr class="total"><td>${esc(totalLabel)}</td><td class="amt">${formatRupees(total)}</td></tr>
      </tbody>
    </table>
  </section>`;

export function payslipHtml(slip: MyPayslip, person: { name: string; employeeCode: string }, logo: string | null): string {
  const s = slip.slip;
  const month = prettyMonth(slip.month);
  const rounding = s.roundingPaise
    ? `<p class="note">Rounded off to the rupee (${s.roundingPaise > 0 ? '+' : '−'}${formatRupees(Math.abs(s.roundingPaise))})</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794, initial-scale=1">
<title>Salary Slip · ${esc(month)} · ${esc(person.name)}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; }
  body { width: 794px; padding: 45px; font: 14px/1.45 Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #131822; }
  article > * + * { margin-top: 32px; }
  header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; background: #f1f3f6; border-radius: 12px; padding: 20px 24px; }
  header img { height: 80px; width: auto; object-fit: contain; justify-self: start; }
  header .brand { font-size: 22px; font-weight: 700; letter-spacing: .04em; color: #4a4bd9; }
  header .company { text-align: center; }
  header h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.25; }
  header .iso { display: inline-block; margin-top: 8px; padding: 2px 12px; border-radius: 999px; background: #4a4bd9; color: #fff; font-size: 12px; font-weight: 600; }
  header .title { text-align: right; }
  header .title p { margin: 0; }
  header .title .big { font-size: 24px; font-weight: 600; }
  header .title .sub { color: #515b6e; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e6e9ee; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e6e9ee; }
  thead th { background: #f1f3f6; font-weight: 600; }
  .amt { text-align: right; font-variant-numeric: tabular-nums; }
  .total td { font-weight: 600; border-bottom: 0; }
  .muted { color: #515b6e; }
  .details th { width: 50%; font-weight: 400; color: #515b6e; }
  .details thead th { width: auto; font-weight: 600; color: #131822; }
  .details td { font-weight: 500; }
  .details tr:last-child th, .details tr:last-child td { border-bottom: 0; }
  footer { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; }
  footer p { margin: 0; }
  footer .legal { max-width: 448px; font-size: 12px; color: #636d80; }
  .net { text-align: right; }
  .net .label { font-size: 18px; font-weight: 600; }
  .net .value { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .note { font-size: 12px; color: #636d80; }
</style>
</head>
<body>
<article>
  <header>
    ${logo ? `<img src="${logo}" alt="Greynote Healthcare">` : '<div class="brand">GREYNOTE</div>'}
    <div class="company">
      <h1>${esc(COMPANY_NAME)}</h1>
      <span class="iso">ISO 9001:2015 Certified Company</span>
    </div>
    <div class="title">
      <p class="big">Salary Slip</p>
      <p class="sub">For the month of ${esc(month)}</p>
    </div>
  </header>

  <div class="grid">
    <table class="details">
      <thead><tr><th colspan="2">Employee Details</th></tr></thead>
      <tbody>
        <tr><th>Employee Name</th><td>${esc(person.name)}</td></tr>
        <tr><th>Employee Code</th><td>${esc(person.employeeCode)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="grid">
    ${amounts('Earnings', s.earnings, 'Total Earnings', s.grossPaise, 'None')}
    ${amounts('Deductions', s.deductions, 'Total Deductions', s.deductionPaise, 'None')}
  </div>

  <footer>
    <p class="legal">This is a computer generated salary slip from ${esc(COMPANY_NAME)}. TA, DA and reimbursements are paid separately and are not part of this slip.</p>
    <div class="net">
      <p class="label">Net Salary</p>
      <p class="value">${formatRupees(s.netPaise)}</p>
      ${rounding}
    </div>
  </footer>
</article>
</body>
</html>
`;
}

/** `test-payslip-2026-09-grn0011.pdf`: whose slip and which month, all lower case (the same habit as the CSV names). */
export const payslipFileName = (person: { name: string; employeeCode: string }, month: string) =>
  `${[slug(person.name), 'payslip', month, slug(person.employeeCode)].filter(Boolean).join('-')}.pdf`;
