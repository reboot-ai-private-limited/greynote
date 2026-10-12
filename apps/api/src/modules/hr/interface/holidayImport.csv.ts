import { parseCsv } from '@/shared/csv/csv.js';
import { HOLIDAY_SCOPES, type HolidayScope } from '../domain/holiday.entity.js';
import type { HolidayImportError, HolidayImportRow } from '../application/usecases/importHolidays.usecase.js';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';

export const MAX_HOLIDAY_IMPORT_ROWS = 500;

/** Header spellings accepted per column — whatever a spreadsheet is likely to have. */
const COLUMN_ALIASES = {
  name: ['name', 'holiday', 'holiday name', 'occasion'],
  date: ['date'],
  scope: ['scope', 'applies to', 'type'],
  zones: ['zones', 'zone'],
  hqs: ['hqs', 'hq', 'headquarters'],
} as const;

export const HOLIDAY_CSV_TEMPLATE =
  'name,date,scope,zones,hqs\n' +
  'Republic Day,2027-01-26,NATIONAL,,\n' +
  'Onam,2027-09-11,ZONE,South,\n' +
  'Local fair,2027-03-05,HQ,,South/Kochi;South/Trivandrum\n';

/**
 * CSV text → shape-checked rows. Checks only what the file alone can tell (columns, dates, scope);
 * zone and HQ names are matched against Territory by the use case.
 * `zones` is `;`-separated names; `hqs` is `;`-separated `Zone/HQ` pairs (an HQ name is unique only inside its Zone).
 */
export function readHolidayCsv(text: string): { rows: HolidayImportRow[]; errors: HolidayImportError[] } {
  let records;
  try {
    records = parseCsv(text);
  } catch (err) {
    return { rows: [], errors: [{ line: 0, message: err instanceof Error ? err.message : 'Unreadable CSV.' }] };
  }
  const [header, ...data] = records;
  if (!header) return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };

  const headerCells = header.cells.map((c) => c.trim().toLowerCase());
  const column = (key: keyof typeof COLUMN_ALIASES) => headerCells.findIndex((h) => (COLUMN_ALIASES[key] as readonly string[]).includes(h));
  const cols = { name: column('name'), date: column('date'), scope: column('scope'), zones: column('zones'), hqs: column('hqs') };

  for (const required of ['name', 'date', 'scope'] as const) {
    if (cols[required] === -1) return { rows: [], errors: [{ line: 1, message: `A "${required}" column is required.` }] };
  }
  if (data.length === 0) return { rows: [], errors: [{ line: 2, message: 'The file has no rows below the header.' }] };
  if (data.length > MAX_HOLIDAY_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `At most ${MAX_HOLIDAY_IMPORT_ROWS} rows per file; this one has ${data.length}.` }] };
  }

  const rows: HolidayImportRow[] = [];
  const errors: HolidayImportError[] = [];
  for (const { line, cells } of data) {
    const cell = (index: number) => (index === -1 ? '' : (cells[index] ?? '').trim());
    const list = (index: number) => cell(index).split(';').map((s) => s.trim()).filter(Boolean);
    const problems: string[] = [];

    const name = cell(cols.name);
    if (name.length < 1 || name.length > 100) problems.push('Name must be 1–100 characters.');
    const date = calendarDateSchema.safeParse(cell(cols.date));
    if (!date.success) problems.push('Date must be a real day written YYYY-MM-DD.');
    const scope = cell(cols.scope).toUpperCase() as HolidayScope;
    if (!HOLIDAY_SCOPES.includes(scope)) problems.push('Scope must be NATIONAL, ZONE or HQ.');

    const zones = list(cols.zones);
    const hqs: Array<{ zone: string; hq: string }> = [];
    for (const pair of list(cols.hqs)) {
      const [zone, hq, ...extra] = pair.split('/').map((s) => s.trim());
      if (!zone || !hq || extra.length) problems.push(`HQ "${pair}" must be written Zone/HQ.`);
      else hqs.push({ zone, hq });
    }
    if (HOLIDAY_SCOPES.includes(scope)) {
      if (scope === 'NATIONAL' && (zones.length || hqs.length)) problems.push('A NATIONAL holiday takes no zones or HQs.');
      if (scope === 'ZONE' && (!zones.length || hqs.length)) problems.push('A ZONE holiday needs zones, and no HQs.');
      if (scope === 'HQ' && (!hqs.length || zones.length)) problems.push('An HQ holiday needs HQs, and no zones.');
    }

    if (problems.length > 0) {
      for (const message of problems) errors.push({ line, message });
      continue;
    }
    rows.push({ line, name, date: date.success ? date.data : '', scope, zones, hqs });
  }
  return { rows, errors };
}
