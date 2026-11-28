import { strToU8, zipSync } from 'fflate';

import { deliverXlsx } from './csv';

/** A cell: text, a number, or empty. Money goes in as rupees (a number), so Excel can add it up. */
export type XlsxCell = string | number | null;

export type XlsxSheet = {
  /** The tab's name (Excel allows 31 characters, no `[]:*?/\`). */
  sheet: string;
  /** A bold first line, e.g. "Asha Roy · DCR · November 2026". */
  title: string;
  header: string[];
  rows: XlsxCell[][];
  /** A bold last line, e.g. ["Total", "", 42]. */
  totals?: XlsxCell[];
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const column = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : column(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const sheetName = (s: string) => s.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';

function cellXml(value: XlsxCell, ref: string, bold: boolean): string {
  if (value === null || value === '') return '';
  const style = bold ? ' s="1"' : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(String(value))}</t></is></c>`;
}

function rowXml(cells: XlsxCell[], n: number, bold: boolean): string {
  return `<row r="${n}">${cells.map((c, i) => cellXml(c, `${column(i)}${n}`, bold)).join('')}</row>`;
}

/**
 * A real .xlsx built on the phone (2026-11-28, the Reports screens): one sheet with a bold title, a bold header, the rows and an
 * optional bold total line, columns sized to their longest value. Plain OOXML zipped with fflate, so it opens in Excel, Google
 * Sheets and LibreOffice, and needs no server.
 */
export function buildXlsx(spec: XlsxSheet): Uint8Array {
  const lines: { cells: XlsxCell[]; bold: boolean }[] = [
    { cells: [spec.title], bold: true },
    { cells: [], bold: false },
    { cells: spec.header, bold: true },
    ...spec.rows.map((cells) => ({ cells, bold: false })),
    ...(spec.totals ? [{ cells: spec.totals, bold: true }] : []),
  ];
  const widths = spec.header.map((h, i) => Math.min(60, Math.max(8, h.length, ...[...spec.rows, spec.totals ?? []].map((r) => String(r[i] ?? '').length)) + 2));
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${lines.map((l, i) => rowXml(l.cells, i + 1, l.bold)).join('')}</sheetData>` +
    '</worksheet>';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escape(sheetName(spec.sheet))}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}

/** Builds the sheet and hands it to the phone (save, share or open; a download in the browser). */
export async function downloadXlsx(fileName: string, spec: XlsxSheet): Promise<string | null> {
  const bytes = buildXlsx(spec);
  return deliverXlsx(fileName, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, spec.title);
}

/** Paise as rupees for a cell (Excel adds them up), two decimals. */
export const rupees = (paise: number) => Math.round(paise) / 100;
