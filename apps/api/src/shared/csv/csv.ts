/**
 * Minimal RFC 4180 CSV reader — enough for an Admin's spreadsheet export: quoted fields (with
 * `""` escapes, commas and newlines inside quotes), CRLF or LF line ends, and the UTF-8 BOM Excel
 * writes. Blank lines are dropped, but each record keeps the file line it started on, so error
 * messages point at the line an Admin sees in their editor. Meaning of the cells is the caller's job.
 */
export interface CsvRecord {
  line: number;
  cells: string[];
}

export function parseCsv(text: string): CsvRecord[] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: CsvRecord[] = [];
  let row: string[] = [];
  let line = 1;
  let rowStartLine = 1;
  let cell = '';
  let inQuotes = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push({ line: rowStartLine, cells: row });
    row = [];
    rowStartLine = line;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      line++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (inQuotes) throw new Error('A quoted field is never closed.');
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
