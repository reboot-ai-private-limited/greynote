import { AppError } from '@/shared/errors/AppError.js';
import type { Holiday, HolidayScope } from '../../domain/holiday.entity.js';
import type { HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { CreateHolidayUseCase } from './createHoliday.usecase.js';

export interface HolidayImportRow {
  line: number;
  name: string;
  date: string;
  scope: HolidayScope;
  /** Zone names. */
  zones: string[];
  /** HQs as the Zone they sit in and their own name. */
  hqs: Array<{ zone: string; hq: string }>;
}

export interface HolidayImportError {
  line: number;
  message: string;
}

export interface HolidayImportPreviewRow {
  line: number;
  name: string;
  date: string;
  scope: HolidayScope;
  zones: string[];
  hqs: string[];
  /** `NEW` will be created; `EXISTS` is already there (same name, date and scope) and is skipped. */
  status: 'NEW' | 'EXISTS';
}

export interface HolidayImportResult {
  dryRun: boolean;
  created: number;
  skipped: number;
  rows: HolidayImportPreviewRow[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Bulk-adds holidays from CSV rows (the Admin's yearly list). All-or-nothing on validation: every
 * row is matched against Territory and the rest of the file first, and any problem rejects the whole
 * file with every problem listed by line. A holiday already on the calendar (same name, date, scope
 * and places, ignoring case) is skipped, so re-uploading a file is a no-op.
 */
export class ImportHolidaysUseCase {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly create: CreateHolidayUseCase,
  ) {}

  async execute(rows: HolidayImportRow[], options: { dryRun: boolean }, actorId: string): Promise<HolidayImportResult> {
    const errors: HolidayImportError[] = [];
    const planned: Array<{ row: HolidayImportRow; zoneIds: string[]; hqIds: string[] }> = [];
    const zoneCache = new Map<string, { id: string; status: string } | null>();
    const zone = async (name: string) => {
      const key = name.toLowerCase();
      if (!zoneCache.has(key)) zoneCache.set(key, await this.territory.findZoneByName(name));
      return zoneCache.get(key) ?? null;
    };

    for (const row of rows) {
      const zoneIds: string[] = [];
      const hqIds: string[] = [];
      for (const name of row.zones) {
        const found = await zone(name);
        if (!found) errors.push({ line: row.line, message: `Zone "${name}" doesn’t exist.` });
        else if (found.status !== 'active') errors.push({ line: row.line, message: `Zone "${name}" is inactive.` });
        else zoneIds.push(found.id);
      }
      for (const { zone: zoneName, hq: hqName } of row.hqs) {
        const parent = await zone(zoneName);
        if (!parent) {
          errors.push({ line: row.line, message: `Zone "${zoneName}" doesn’t exist.` });
          continue;
        }
        const found = await this.territory.findHqByName(parent.id, hqName);
        if (!found) errors.push({ line: row.line, message: `HQ "${zoneName}/${hqName}" doesn’t exist.` });
        else if (found.status !== 'active') errors.push({ line: row.line, message: `HQ "${zoneName}/${hqName}" is inactive.` });
        else hqIds.push(found.id);
      }
      planned.push({ row, zoneIds: [...new Set(zoneIds)], hqIds: [...new Set(hqIds)] });
    }

    // The same holiday twice in the file.
    const seen = new Map<string, number>();
    for (const { row, zoneIds, hqIds } of planned) {
      const key = [row.name.toLowerCase(), row.date, row.scope, [...zoneIds].sort().join(), [...hqIds].sort().join()].join('|');
      const first = seen.get(key);
      if (first !== undefined) errors.push({ line: row.line, message: `Same holiday as line ${first}.` });
      else seen.set(key, row.line);
    }

    if (errors.length > 0) {
      throw AppError.badRequest(`The file has ${errors.length} problem(s); nothing was imported.`, { errors: errors.sort((a, b) => a.line - b.line) });
    }

    const existingByDate = new Map<string, Holiday[]>();
    const preview: HolidayImportPreviewRow[] = [];
    const toCreate: typeof planned = [];
    for (const item of planned) {
      const { row, zoneIds, hqIds } = item;
      if (!existingByDate.has(row.date)) existingByDate.set(row.date, await this.holidays.list({ from: row.date, to: row.date }));
      const exists = (existingByDate.get(row.date) ?? []).some(
        (h) => h.name.toLowerCase() === row.name.toLowerCase() && h.scope === row.scope && sameSet(h.zoneIds, zoneIds) && sameSet(h.hqIds, hqIds),
      );
      if (!exists) toCreate.push(item);
      preview.push({ line: row.line, name: row.name, date: row.date, scope: row.scope, zones: row.zones, hqs: row.hqs.map((h) => `${h.zone}/${h.hq}`), status: exists ? 'EXISTS' : 'NEW' });
    }

    if (!options.dryRun) {
      for (const { row, zoneIds, hqIds } of toCreate) {
        await this.create.execute({ name: row.name, date: row.date, scope: row.scope, zoneIds, hqIds }, actorId);
      }
    }
    return { dryRun: options.dryRun, created: toCreate.length, skipped: preview.length - toCreate.length, rows: preview };
  }
}
