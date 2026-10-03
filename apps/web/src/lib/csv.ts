/**
 * CSV for the Accountant's sheets, to open in a spreadsheet. Built here and downloaded by the browser: the API has no export.
 * Escaping follows RFC 4180 (quote a cell holding a comma, quote or newline; double any quote inside). A cell that a spreadsheet
 * would read as a formula is prefixed so it is shown as text: a name or remark an employee typed must never run when opened.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  // Numbers are written as numbers; only text is guarded (a negative amount is "-1500", not a formula).
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** A byte-order mark so Excel reads the file as UTF-8 (a name with an accent would otherwise come out garbled). */
export const CSV_BOM = '﻿';

/** Rupees with two decimals and no grouping, as a spreadsheet reads a number: `12345.50`. */
export function rupeesForCsv(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Starts a download of `csv` in the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
