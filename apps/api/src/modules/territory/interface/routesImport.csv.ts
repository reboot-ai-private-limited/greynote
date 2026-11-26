import { parseCsv } from '@/shared/csv/csv.js';
import { rupeesToPaise } from '@/shared/money/paise.js';
import type { RouteType } from '../domain/route.entity.js';
import type { HierarchyImportError } from '../domain/hierarchyImport.js';
import { nameSchema } from './territory.schemas.js';
import { MAX_IMPORT_ROWS } from './hierarchyImport.csv.js';

/** One route of the file, shape-checked. An empty place means the HQ town; an empty `toHq` means the From HQ. */
export interface RouteImportRow {
  line: number;
  fromHq: string;
  fromPlace: string | undefined;
  fromType: RouteType | undefined;
  toHq: string;
  toPlace: string | undefined;
  toType: RouteType | undefined;
  /** One way, up to 2 decimals, more than 0. */
  distanceKm: string;
  taPerKmRateOverridePaise: number | null;
  taFixedPaise: number | null;
}

const COLUMNS = {
  fromHq: ['from_hq', 'from hq', 'hq'],
  fromPlace: ['from_place', 'from place', 'from'],
  fromType: ['from_type', 'from type'],
  toHq: ['to_hq', 'to hq'],
  toPlace: ['to_place', 'to place', 'to'],
  toType: ['to_type', 'to type'],
  km: ['km', 'distance', 'distance_km'],
  taRate: ['ta_rate', 'ta rate', 'rate_per_km', 'rate per km'],
  taFixed: ['ta_fixed', 'ta fixed', 'fixed_ta', 'fixed ta', 'fare'],
} as const;

const TYPES: Record<string, RouteType> = {
  hq: 'HQ',
  ex: 'EX_STATION',
  'ex station': 'EX_STATION',
  'ex-station': 'EX_STATION',
  ex_station: 'EX_STATION',
  out: 'OUT_STATION',
  'out station': 'OUT_STATION',
  'out-station': 'OUT_STATION',
  out_station: 'OUT_STATION',
};

/**
 * CSV → route rows (decision-log 2026-11-26). Columns: from_hq, from_place, to_hq, to_place, km, and optional
 * from_type / to_type (HQ, EX, OUT — only used to create a place that doesn't exist yet), ta_rate (₹ per km) and
 * ta_fixed (₹ for the day). Only checks what the file alone can tell.
 */
export function readRoutesCsv(text: string): { rows: RouteImportRow[]; errors: HierarchyImportError[] } {
  let records;
  try {
    records = parseCsv(text);
  } catch (err) {
    return { rows: [], errors: [{ line: 0, message: err instanceof Error ? err.message : 'Unreadable CSV.' }] };
  }
  const [header, ...data] = records;
  if (!header) return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };
  const headerCells = header.cells.map((c) => c.trim().toLowerCase());
  const col = (key: keyof typeof COLUMNS) => headerCells.findIndex((h) => (COLUMNS[key] as readonly string[]).includes(h));
  const cols = Object.fromEntries((Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>).map((k) => [k, col(k)])) as Record<keyof typeof COLUMNS, number>;

  if (cols.fromHq === -1 || cols.km === -1 || (cols.toPlace === -1 && cols.toHq === -1)) {
    return { rows: [], errors: [{ line: 1, message: 'Columns needed: from_hq, from_place, to_hq, to_place, km (and optionally from_type, to_type, ta_rate, ta_fixed).' }] };
  }
  if (data.length === 0) return { rows: [], errors: [{ line: 2, message: 'The file has no rows below the header.' }] };
  if (data.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `At most ${MAX_IMPORT_ROWS} rows per file; this one has ${data.length}.` }] };
  }

  const rows: RouteImportRow[] = [];
  const errors: HierarchyImportError[] = [];
  for (const { line, cells } of data) {
    const before = errors.length;
    const cell = (index: number) => (index === -1 ? '' : (cells[index] ?? '').trim());
    const name = (index: number, label: string): string | undefined => {
      const raw = cell(index);
      if (raw === '') return undefined;
      const parsed = nameSchema.safeParse(raw);
      if (!parsed.success) errors.push({ line, message: `${label} must be 1–100 characters.` });
      return parsed.success ? parsed.data : undefined;
    };
    const type = (index: number, label: string): RouteType | undefined => {
      const raw = cell(index).toLowerCase();
      if (raw === '') return undefined;
      const found = TYPES[raw];
      if (!found) errors.push({ line, message: `${label} must be HQ, EX or OUT.` });
      return found;
    };
    const money = (index: number, label: string): number | null => {
      const raw = cell(index);
      if (raw === '') return null;
      const paise = rupeesToPaise(raw);
      if (paise === null) errors.push({ line, message: `${label} must be a rupee amount with up to 2 decimals.` });
      return paise;
    };

    const fromHq = name(cols.fromHq, 'From HQ');
    if (!fromHq && cell(cols.fromHq) === '') errors.push({ line, message: 'From HQ is required.' });
    const toHq = name(cols.toHq, 'To HQ') ?? fromHq;
    const fromPlace = name(cols.fromPlace, 'From place');
    const toPlace = name(cols.toPlace, 'To place');
    const km = cell(cols.km);
    if (!/^\d+(\.\d{1,2})?$/.test(km) || Number(km) <= 0) errors.push({ line, message: 'km must be more than 0, with up to 2 decimals.' });
    const taPerKmRateOverridePaise = money(cols.taRate, 'ta_rate');
    const taFixedPaise = money(cols.taFixed, 'ta_fixed');
    if (taPerKmRateOverridePaise !== null && taFixedPaise !== null) errors.push({ line, message: 'Give either ta_rate or ta_fixed, not both.' });
    const fromType = type(cols.fromType, 'from_type');
    const toType = type(cols.toType, 'to_type');

    if (errors.length > before || !fromHq || !toHq) continue;
    rows.push({ line, fromHq, fromPlace, fromType, toHq, toPlace, toType, distanceKm: km, taPerKmRateOverridePaise, taFixedPaise });
  }
  return { rows, errors };
}
