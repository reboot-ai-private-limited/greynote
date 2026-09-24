import { AppError } from '@/shared/errors/AppError.js';
import type { AreaType } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type {
  HierarchyImportError,
  HierarchyImportResult,
  HierarchyImportRow,
} from '../../domain/hierarchyImport.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { TerritoryStatus } from '../../domain/territoryStatus.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';

/** A node the file names: already in the database (`id` set) or to be created (`id` null until written). */
interface PlanNode {
  id: string | null;
  name: string;
  path: string;
  status: TerritoryStatus;
  parent: PlanNode | null;
  type?: AreaType;
}

const keyOf = (name: string) => name.toLowerCase();

/**
 * Bulk-creates Zones / HQs / Areas from CSV rows (decision-log 2026-09-24; Routes are excluded
 * because each waypoint needs a map-confirmed pin).
 *
 * All-or-nothing on validation: every row is checked against the database and the rest of the
 * file first, and any problem rejects the whole file with every problem listed. Names that
 * already exist (ignoring case) are reused, never duplicated or modified — so re-uploading the
 * same file is a no-op, and a write interrupted part-way can simply be re-run.
 */
export class ImportHierarchyUseCase {
  constructor(
    private readonly zones: ZoneRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly areas: AreaRepositoryPort,
  ) {}

  async execute(rows: HierarchyImportRow[], options: { dryRun: boolean }): Promise<HierarchyImportResult> {
    const zoneNodes = new Map<string, PlanNode>();
    const hqNodes = new Map<string, PlanNode>();
    const areaNodes = new Map<string, PlanNode>();
    const errors: HierarchyImportError[] = [];

    const inactive = (line: number, level: string, node: PlanNode) =>
      errors.push({ line, message: `${level} "${node.path}" is inactive. Reactivate it first.` });

    for (const row of rows) {
      const zone = await this.resolve(zoneNodes, keyOf(row.zone), row.zone, null, () =>
        this.zones.findByName(row.zone),
      );
      if (zone.status !== 'active') {
        inactive(row.line, 'Zone', zone);
        continue;
      }
      if (row.hq === undefined) continue;

      const hqName = row.hq;
      const hq = await this.resolve(hqNodes, `${keyOf(row.zone)}/${keyOf(hqName)}`, hqName, zone, () =>
        zone.id === null ? Promise.resolve(null) : this.hqs.findByName(zone.id, hqName),
      );
      if (hq.status !== 'active') {
        inactive(row.line, 'HQ', hq);
        continue;
      }
      if (row.area === undefined) continue;

      const { name: areaName, type } = row.area;
      const area = await this.resolve(
        areaNodes,
        `${keyOf(row.zone)}/${keyOf(hqName)}/${keyOf(areaName)}`,
        areaName,
        hq,
        () => (hq.id === null ? Promise.resolve(null) : this.areas.findByName(hq.id, areaName)),
        type,
      );
      if (area.status !== 'active') {
        inactive(row.line, 'Area', area);
      } else if (area.type !== type) {
        errors.push({
          line: row.line,
          message:
            area.id === null
              ? `Area "${area.path}" appears earlier in the file as ${area.type}.`
              : `Area "${area.path}" already exists as ${area.type}. Change its type in the app, not by import.`,
        });
      }
    }

    if (errors.length > 0) {
      throw AppError.badRequest(`The file has ${errors.length} problem(s); nothing was imported.`, { errors });
    }

    const toCreate = {
      zones: [...zoneNodes.values()].filter((n) => n.id === null),
      hqs: [...hqNodes.values()].filter((n) => n.id === null),
      areas: [...areaNodes.values()].filter((n) => n.id === null),
    };
    if (!options.dryRun) await this.write(toCreate);

    return {
      dryRun: options.dryRun,
      rows: rows.length,
      created: {
        zones: toCreate.zones.map((n) => n.path),
        hqs: toCreate.hqs.map((n) => n.path),
        areas: toCreate.areas.map((n) => n.path),
      },
      existing: {
        zones: zoneNodes.size - toCreate.zones.length,
        hqs: hqNodes.size - toCreate.hqs.length,
        areas: areaNodes.size - toCreate.areas.length,
      },
    };
  }

  /** The node for `key`, looked up once per file: repeated rows share it. */
  private async resolve(
    cache: Map<string, PlanNode>,
    key: string,
    name: string,
    parent: PlanNode | null,
    find: () => Promise<{ id: string; name: string; status: TerritoryStatus; type?: AreaType } | null>,
    type?: AreaType,
  ): Promise<PlanNode> {
    const cached = cache.get(key);
    if (cached) return cached;

    const existing = await find();
    const displayName = existing?.name ?? name;
    // An existing Area's stored type wins, so a mismatch with the file's type can be reported.
    const nodeType = existing?.type ?? type;
    const node: PlanNode = {
      id: existing?.id ?? null,
      name: displayName,
      path: parent ? `${parent.path} / ${displayName}` : displayName,
      status: existing?.status ?? 'active',
      parent,
      ...(nodeType !== undefined && { type: nodeType }),
    };
    cache.set(key, node);
    return node;
  }

  /** Parents before children, so every new node's parent id is known when it's written. */
  private async write(toCreate: { zones: PlanNode[]; hqs: PlanNode[]; areas: PlanNode[] }): Promise<void> {
    const parentId = (node: PlanNode) => {
      const id = node.parent?.id;
      if (!id) throw AppError.internal('INTERNAL', { reason: 'IMPORT_PARENT_NOT_WRITTEN', path: node.path });
      return id;
    };
    for (const node of toCreate.zones) {
      node.id = (await this.zones.create({ name: node.name, status: 'active' })).id;
    }
    for (const node of toCreate.hqs) {
      node.id = (await this.hqs.create({ zoneId: parentId(node), name: node.name, status: 'active' })).id;
    }
    for (const node of toCreate.areas) {
      const type = node.type;
      if (!type) throw AppError.internal('INTERNAL', { reason: 'IMPORT_AREA_WITHOUT_TYPE', path: node.path });
      node.id = (await this.areas.create({ hqId: parentId(node), name: node.name, type, status: 'active' })).id;
    }
  }
}
