import type { HierarchyImportError, HierarchyImportRow } from '../domain/hierarchyImport.js';
import { parseCsv } from './csv.js';
import { nameSchema } from './territory.schemas.js';

export const MAX_IMPORT_ROWS = 2000;

/** Header spellings accepted per column — whatever a spreadsheet is likely to have. */
const COLUMN_ALIASES: Record<'zone' | 'hq', string[]> = {
  zone: ['zone'],
  hq: ['hq', 'headquarters', 'headquarter'],
};

/** Columns from before Area was removed (decision-log 2026-10-03) — refused loudly rather than ignored. */
const RETIRED_COLUMNS = ['area', 'area_type', 'area type', 'areatype'];

/**
 * CSV text → shape-checked rows. Only checks what the file alone can tell (columns, names);
 * everything that needs the database is the use case's job.
 */
export function readHierarchyCsv(text: string): { rows: HierarchyImportRow[]; errors: HierarchyImportError[] } {
  let records;
  try {
    records = parseCsv(text);
  } catch (err) {
    return { rows: [], errors: [{ line: 0, message: err instanceof Error ? err.message : 'Unreadable CSV.' }] };
  }
  const [header, ...data] = records;
  if (!header) return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };

  const headerCells = header.cells.map((c) => c.trim().toLowerCase());
  const column = (key: keyof typeof COLUMN_ALIASES) =>
    headerCells.findIndex((h) => COLUMN_ALIASES[key].includes(h));
  const cols = { zone: column('zone'), hq: column('hq') };

  if (cols.zone === -1) return { rows: [], errors: [{ line: 1, message: 'A "zone" column is required.' }] };
  if (headerCells.some((h) => RETIRED_COLUMNS.includes(h))) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Areas no longer exist. Remove the "area" and "area_type" columns; a file is zone and hq only.' }],
    };
  }
  if (data.length === 0) return { rows: [], errors: [{ line: 2, message: 'The file has no rows below the header.' }] };
  if (data.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `At most ${MAX_IMPORT_ROWS} rows per file; this one has ${data.length}.` }] };
  }

  const rows: HierarchyImportRow[] = [];
  const errors: HierarchyImportError[] = [];

  for (const { line, cells } of data) {
    const cell = (index: number) => (index === -1 ? '' : (cells[index] ?? '').trim());
    const name = (index: number, label: string): string | undefined => {
      const raw = cell(index);
      if (raw === '') return undefined;
      const parsed = nameSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push({ line, message: `${label} name must be 1–100 characters.` });
        return undefined;
      }
      return parsed.data;
    };

    const zone = name(cols.zone, 'Zone');
    const hq = name(cols.hq, 'HQ');

    if (!zone) {
      if (cell(cols.zone) === '') errors.push({ line, message: 'Zone is required.' });
      continue;
    }
    rows.push({ line, zone, hq });
  }
  return { rows, errors };
}
