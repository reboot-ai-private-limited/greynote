import { AREA_TYPES, type AreaType } from '../domain/area.entity.js';
import type { HierarchyImportError, HierarchyImportRow } from '../domain/hierarchyImport.js';
import { parseCsv } from './csv.js';
import { nameSchema } from './territory.schemas.js';

export const MAX_IMPORT_ROWS = 2000;

/** Header spellings accepted per column — whatever a spreadsheet is likely to have. */
const COLUMN_ALIASES: Record<'zone' | 'hq' | 'area' | 'areaType', string[]> = {
  zone: ['zone'],
  hq: ['hq', 'headquarters', 'headquarter'],
  area: ['area'],
  areaType: ['area_type', 'area type', 'areatype', 'type'],
};

/** "Ex Station", "ex-station", "EX_STATION" → `EX_STATION`. */
function toAreaType(raw: string): AreaType | undefined {
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (AREA_TYPES as readonly string[]).includes(normalized) ? (normalized as AreaType) : undefined;
}

/**
 * CSV text → shape-checked rows. Only checks what the file alone can tell (columns, names,
 * area types, an Area without an HQ); everything that needs the database is the use case's job.
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
  const cols = { zone: column('zone'), hq: column('hq'), area: column('area'), areaType: column('areaType') };

  if (cols.zone === -1) return { rows: [], errors: [{ line: 1, message: 'A "zone" column is required.' }] };
  if (cols.area !== -1 && (cols.hq === -1 || cols.areaType === -1)) {
    return { rows: [], errors: [{ line: 1, message: 'An "area" column needs "hq" and "area_type" columns too.' }] };
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
    const area = name(cols.area, 'Area');
    const rawType = cell(cols.areaType);

    if (!zone) {
      if (cell(cols.zone) === '') errors.push({ line, message: 'Zone is required.' });
      continue;
    }
    if (area && !hq) {
      errors.push({ line, message: 'An Area needs an HQ on the same row.' });
      continue;
    }
    if (!area) {
      if (rawType !== '') errors.push({ line, message: 'area_type is set but area is empty.' });
      rows.push({ line, zone, hq });
      continue;
    }
    const type = toAreaType(rawType);
    if (!type) {
      errors.push({ line, message: `area_type must be one of HQ, EX_STATION, OUT_STATION (got "${rawType}").` });
      continue;
    }
    rows.push({ line, zone, hq, area: { name: area, type } });
  }
  return { rows, errors };
}
