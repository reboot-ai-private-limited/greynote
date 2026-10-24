import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * CSV downloads, built on the phone from what the screen already has (the server has no CSV endpoint; the web portal builds its own
 * the same way). The file is written to the app's cache and handed to the share sheet, so the user saves it to Files or Drive, or
 * sends it on WhatsApp or by email.
 */

type Cell = string | number | null | undefined;

/** One cell, quoted when it holds a comma, a quote or a line break. */
function cell(value: Cell): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header and rows as CSV text. Lines end in CRLF and the text starts with a BOM, so Excel reads ₹ and Hindi names correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Paise as a plain rupee figure ("1234.50"), so a spreadsheet can add the column up. */
export const rupeesCell = (paise: number) => (paise / 100).toFixed(2);

/** Writes the CSV and opens the share sheet. Throws with a message fit to show when the phone can't share files. */
export async function shareCsv(fileName: string, csv: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone can’t share files.');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: title });
}
