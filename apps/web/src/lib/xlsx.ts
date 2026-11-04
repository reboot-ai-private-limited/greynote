import writeXlsxFile from 'write-excel-file/browser';

type Cell = string | number | null;

/**
 * Starts a download of a one-sheet Excel file: a bold header row, then the rows. Money goes in as rupees (a number, so the sheet can add it up).
 * Text is written as text, never as a formula, so a name an employee typed cannot run when the file is opened.
 */
export async function downloadXlsx(filename: string, sheetName: string, header: readonly string[], rows: readonly (readonly Cell[])[]): Promise<void> {
  const data = [header.map((value) => ({ value, fontWeight: 'bold' as const })), ...rows.map((r) => r.map((v) => (v === null ? null : typeof v === 'number' ? { value: v, type: Number } : { value: v, type: String })))];
  await writeXlsxFile(data as never, { sheet: sheetName.slice(0, 31) }).toFile(`${filename.replace(/\.(csv|xlsx)$/, '')}.xlsx`);
}

export const rupees = (paise: number): number => paise / 100;
