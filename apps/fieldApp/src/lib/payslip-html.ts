import { prettyMonth } from '@/offline/day';

import type { MyPayslip, SlipLine } from './docs';
import { formatRupees } from './money';
import { slug } from './slug';

/**
 * The payslip as one HTML file, laid out like the web's salary slip (apps/web PayslipScreen): the Greynote logo, the company name,
 * "Salary Slip for the month of …", the employee, earnings and deductions with their totals, and the net salary. The server does the
 * sums; the phone only prints them. The logo is inside the file as a picture, so the file stands alone: open it in any browser, or print
 * it to PDF from there. The phone's slip carries the employee's name and code only (not the UAN, ESI, bank details, joining date or the
 * days attended), so those rows of the web slip are left out until the server sends them.
 */

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
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salary Slip · ${esc(month)} · ${esc(person.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1b1f24; background: #fff; }
  article { max-width: 880px; margin: 0 auto; }
  header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; background: #f1f4f8; border-radius: 12px; padding: 18px 22px; }
  header img { height: 56px; width: auto; }
  header .brand { font-size: 22px; font-weight: 700; letter-spacing: .04em; color: #1e88e5; }
  header .company { text-align: center; }
  header h1 { margin: 0; font-size: 22px; line-height: 1.2; }
  header .iso { display: inline-block; margin-top: 8px; padding: 2px 12px; border-radius: 999px; background: #1e88e5; color: #fff; font-size: 12px; font-weight: 600; }
  header .title { text-align: right; }
  header .title p { margin: 0; }
  header .title .big { font-size: 22px; font-weight: 600; }
  header .title .sub { color: #5b6470; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  h2 { margin: 0 0 8px; font-size: 17px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #d5dbe3; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #d5dbe3; }
  thead th { background: #f1f4f8; font-weight: 600; }
  .amt { text-align: right; font-variant-numeric: tabular-nums; }
  .total td { font-weight: 600; border-bottom: 0; }
  .muted { color: #5b6470; }
  .details th { width: 50%; font-weight: 400; color: #5b6470; }
  .details td { font-weight: 500; }
  footer { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; margin-top: 28px; }
  footer p { margin: 0; max-width: 420px; font-size: 12px; color: #6b7480; }
  .net { text-align: right; }
  .net .label { font-size: 17px; font-weight: 600; color: #1b1f24; max-width: none; }
  .net .value { font-size: 30px; font-weight: 700; color: #1b1f24; max-width: none; font-variant-numeric: tabular-nums; }
  .note { font-size: 12px; color: #6b7480; }
  @media (max-width: 640px) {
    header { grid-template-columns: 1fr; text-align: center; }
    header .title { text-align: center; }
    .grid { grid-template-columns: 1fr; }
    .net { text-align: left; }
  }
  @media print { body { padding: 0; } }
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
    <section>
      <table class="details">
        <thead><tr><th colspan="2">Employee Details</th></tr></thead>
        <tbody>
          <tr><th>Employee Name</th><td>${esc(person.name)}</td></tr>
          <tr><th>Employee Code</th><td>${esc(person.employeeCode)}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <div class="grid">
    ${amounts('Earnings', s.earnings, 'Total Earnings', s.grossPaise, 'None')}
    ${amounts('Deductions', s.deductions, 'Total Deductions', s.deductionPaise, 'No deductions this month.')}
  </div>

  <footer>
    <p>This is a computer generated salary slip from ${esc(COMPANY_NAME)}. TA, DA and reimbursements are paid separately and are not part of this slip.</p>
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

/** `rahul-roy-payslip-2026-10-emp03.html`: whose slip and which month, all lower case (the same habit as the CSV names). */
export const payslipFileName = (person: { name: string; employeeCode: string }, month: string) =>
  `${[slug(person.name), 'payslip', month, slug(person.employeeCode)].filter(Boolean).join('-')}.html`;
