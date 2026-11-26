import { AppError } from '@/shared/errors/AppError.js';
import type { HierarchyImportError } from '../../domain/hierarchyImport.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { pairKeyOf, type Place } from '../../domain/place.entity.js';
import type { PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import type { RouteType } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteImportRow } from '../../interface/routesImport.csv.js';
import type { PlaceRoutes } from './placeRoutes.js';

export interface RoutesImportResult {
  dryRun: boolean;
  rows: number;
  /** "HQ / place" for each place made, and each route's name. */
  created: { places: string[]; routes: string[] };
  /** Routes already there with the same km: left as they are. */
  existing: { routes: number };
}

/** A place the file names: found, or to be made (`id` null until written). */
interface PlannedPlace {
  id: string | null;
  hq: Hq;
  name: string;
  type: RouteType;
  isHqTown: boolean;
  status: Place['status'];
}

const keyOf = (hqId: string, name: string) => `${hqId}|${name.toLowerCase()}`;

/**
 * Bulk Place ↔ Place routes from a CSV (decision-log 2026-11-26), so a manager over many HQs can be given every route
 * they travel in one go. HQs must exist (named uniquely across Zones). A missing place is made when its row gives a
 * type. A route already there with the same km is left alone; with a different km it is a problem (change it in the
 * app). All-or-nothing: every problem in the file is listed and nothing is written.
 */
export class ImportRoutesUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly places: PlaceRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly placeRoutes: PlaceRoutes,
  ) {}

  async execute(rows: RouteImportRow[], options: { dryRun: boolean }): Promise<RoutesImportResult> {
    const errors: HierarchyImportError[] = [];
    const allHqs = (await this.hqs.list({ page: 1, pageSize: 100_000 })).items;
    const hqsByName = new Map<string, Hq[]>();
    for (const hq of allHqs) hqsByName.set(hq.name.toLowerCase(), [...(hqsByName.get(hq.name.toLowerCase()) ?? []), hq]);
    const planned = new Map<string, PlannedPlace>();
    const pairsInFile = new Set<string>();
    const toCreate: Array<{ row: RouteImportRow; from: PlannedPlace; to: PlannedPlace }> = [];
    let existing = 0;

    const hqNamed = (line: number, name: string): Hq | null => {
      const found = hqsByName.get(name.toLowerCase()) ?? [];
      if (found.length === 1) return found[0]!;
      errors.push({ line, message: found.length === 0 ? `No HQ called "${name}".` : `More than one HQ is called "${name}". Rename one first.` });
      return null;
    };
    const placeIn = async (line: number, hq: Hq, name: string | undefined, type: RouteType | undefined, side: string): Promise<PlannedPlace | null> => {
      const placeName = name ?? hq.name;
      const key = keyOf(hq.id, placeName);
      const cached = planned.get(key);
      if (cached) return cached;
      const found = name === undefined ? await this.places.findHqTown(hq.id) : await this.places.findByName(hq.id, placeName);
      if (found) {
        const place = { id: found.id, hq, name: found.name, type: found.type, isHqTown: found.isHqTown, status: found.status };
        planned.set(key, place);
        return place;
      }
      if (name === undefined || placeName.toLowerCase() === hq.name.toLowerCase()) {
        errors.push({ line, message: `HQ "${hq.name}" has no town place yet. Run the places migration first.` });
        return null;
      }
      if (!type) {
        errors.push({ line, message: `"${placeName}" is not a place of ${hq.name} yet. Give ${side}_type (HQ, EX or OUT) to create it.` });
        return null;
      }
      const place: PlannedPlace = { id: null, hq, name: placeName, type, isHqTown: false, status: 'active' };
      planned.set(key, place);
      return place;
    };

    for (const row of rows) {
      const fromHq = hqNamed(row.line, row.fromHq);
      const toHq = hqNamed(row.line, row.toHq);
      if (!fromHq || !toHq) continue;
      if (fromHq.status !== 'active' || toHq.status !== 'active') {
        errors.push({ line: row.line, message: 'An HQ on this row is inactive. Reactivate it first.' });
        continue;
      }
      const from = await placeIn(row.line, fromHq, row.fromPlace, row.fromType, 'from');
      const to = await placeIn(row.line, toHq, row.toPlace, row.toType, 'to');
      if (!from || !to) continue;
      if (from === to) {
        errors.push({ line: row.line, message: 'From and To are the same place. A day at one place needs no route.' });
        continue;
      }
      if (from.status !== 'active' || to.status !== 'active') {
        errors.push({ line: row.line, message: 'A place on this row is inactive. Reactivate it first.' });
        continue;
      }
      const pair = pairKeyOf(keyOf(from.hq.id, from.name), keyOf(to.hq.id, to.name));
      if (pairsInFile.has(pair)) {
        errors.push({ line: row.line, message: `${from.name} ↔ ${to.name} is in the file twice (a route serves both ways).` });
        continue;
      }
      pairsInFile.add(pair);
      const already = from.id && to.id ? await this.routes.findByPair(from.id, to.id) : null;
      if (already) {
        if (Number(already.distanceKm) !== Number(row.distanceKm)) {
          errors.push({ line: row.line, message: `${already.name} already exists with ${already.distanceKm ?? 'no'} km. Change it in the app.` });
        } else {
          existing++;
        }
        continue;
      }
      toCreate.push({ row, from, to });
    }

    if (errors.length > 0) {
      throw AppError.badRequest(`The file has ${errors.length} problem(s); nothing was imported.`, { errors });
    }

    const newPlaces = [...planned.values()].filter((p) => p.id === null);
    const routeNames: string[] = [];
    if (!options.dryRun) {
      for (const p of newPlaces) {
        p.id = (await this.places.create({ hqId: p.hq.id, name: p.name, type: p.type, isHqTown: false, status: 'active' })).id;
      }
    }
    for (const { row, from, to } of toCreate) {
      const asPlace = (p: PlannedPlace): Place => ({ id: p.id ?? `new:${p.name}`, hqId: p.hq.id, name: p.name, type: p.type, isHqTown: p.isHqTown, status: p.status });
      const ends = await this.placeRoutes.endsOf(asPlace(from), asPlace(to));
      routeNames.push(ends.name);
      if (options.dryRun) continue;
      await this.routes.create({
        ...ends,
        typeSource: 'MANUAL',
        distanceKm: row.distanceKm,
        taPerKmRateOverridePaise: row.taPerKmRateOverridePaise,
        taFixedPaise: row.taFixedPaise,
        status: 'active',
      });
    }

    return {
      dryRun: options.dryRun,
      rows: rows.length,
      created: { places: newPlaces.map((p) => `${p.hq.name} / ${p.name}`), routes: routeNames },
      existing: { routes: existing },
    };
  }
}
