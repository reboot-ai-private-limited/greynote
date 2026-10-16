import { Types, type ClientSession } from 'mongoose';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import type { RouteType } from '../domain/route.entity.js';
import type { ArchivedItem, DeletionScope, PeopleAffected, TerritoryDeletionStorePort, TerritoryKind } from '../domain/territoryDeletion.js';
import { HqModel } from './hq.schema.js';
import { ManagerCoverageModel } from './managerCoverage.schema.js';
import { RouteModel } from './route.schema.js';
import { RouteAssignmentModel } from './routeAssignment.schema.js';
import { TerritoryArchiveModel } from './territoryArchive.schema.js';
import { UserHqAssignmentModel } from './userHqAssignment.schema.js';
import { ZoneModel } from './zone.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const decimal = (value: string | null) => (value === null ? null : Types.Decimal128.fromString(value));

export class MongoTerritoryDeletionAdapter implements TerritoryDeletionStorePort {
  private readonly transactions = new MongooseTransactionRunner();

  async resolve(kind: TerritoryKind, id: string): Promise<DeletionScope | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    let zoneDocs: Array<{ _id: Types.ObjectId; name: string }> = [];
    let hqDocs: Array<{ _id: Types.ObjectId; name: string; zoneId: Types.ObjectId }> = [];
    let routeDocs: Awaited<ReturnType<typeof this.routesOf>> = [];
    let name: string;

    if (kind === 'ZONE') {
      const zone = await ZoneModel.findById(id).lean();
      if (!zone) return null;
      name = zone.name;
      zoneDocs = [{ _id: zone._id, name: zone.name }];
      hqDocs = await HqModel.find({ zoneId: zone._id }).sort({ name: 1 }).lean();
      routeDocs = await this.routesOf(hqDocs.map((h) => h._id));
    } else if (kind === 'HQ') {
      const hq = await HqModel.findById(id).lean();
      if (!hq) return null;
      name = hq.name;
      hqDocs = [hq];
      routeDocs = await this.routesOf([hq._id]);
    } else {
      const route = await RouteModel.findById(id).lean();
      if (!route) return null;
      name = route.name;
      routeDocs = [route];
    }

    // Names of the parents of whatever is being deleted, for the archive rows.
    const hqIds = [...new Set([...hqDocs.map((h) => String(h._id)), ...routeDocs.map((r) => String(r.hqId))])];
    const hqs = await HqModel.find({ _id: { $in: hqIds.map(oid) } }).lean();
    const zoneIds = [...new Set([...zoneDocs.map((z) => String(z._id)), ...hqs.map((h) => String(h.zoneId))])];
    const zones = await ZoneModel.find({ _id: { $in: zoneIds.map(oid) } }).lean();
    const hqById = new Map(hqs.map((h) => [String(h._id), h]));
    const zoneById = new Map(zones.map((z) => [String(z._id), z]));

    return {
      kind,
      id,
      name,
      zones: zoneDocs.map((z) => ({ id: String(z._id), name: z.name })),
      hqs: hqDocs.map((h) => ({ id: String(h._id), name: h.name, zoneId: String(h.zoneId), zoneName: zoneById.get(String(h.zoneId))?.name ?? '' })),
      routes: routeDocs.map((r) => {
        const hq = hqById.get(String(r.hqId));
        const zoneId = hq ? String(hq.zoneId) : '';
        return {
          id: String(r._id),
          name: r.name,
          hqId: String(r.hqId),
          hqName: hq?.name ?? '',
          zoneId,
          zoneName: zoneById.get(zoneId)?.name ?? '',
          type: r.type as RouteType,
          destinationName: r.destinationName,
          distanceKm: r.distanceKm?.toString() ?? null,
          taPerKmRateOverridePaise: r.taPerKmRateOverridePaise ?? null,
        };
      }),
    };
  }

  private routesOf(hqIds: Types.ObjectId[]) {
    return RouteModel.find({ hqId: { $in: hqIds } }).sort({ name: 1 }).lean();
  }

  async countPeople(scope: DeletionScope): Promise<PeopleAffected> {
    const routeIds = scope.routes.map((r) => oid(r.id));
    const hqIds = scope.hqs.map((h) => oid(h.id));
    const zoneIds = scope.zones.map((z) => oid(z.id));
    const [routeUsers, hqUsers, coverUsers] = await Promise.all([
      routeIds.length ? RouteAssignmentModel.distinct('userId', { routeId: { $in: routeIds }, status: 'active' }) : [],
      hqIds.length ? UserHqAssignmentModel.distinct('userId', { hqId: { $in: hqIds }, status: 'active' }) : [],
      hqIds.length || zoneIds.length
        ? ManagerCoverageModel.distinct('userId', { $or: [{ hqIds: { $in: hqIds } }, { zoneIds: { $in: zoneIds } }] })
        : [],
    ]);
    const all = new Set([...routeUsers, ...hqUsers, ...coverUsers].map(String));
    return { total: all.size, routes: routeUsers.length, hq: hqUsers.length, coverage: coverUsers.length };
  }

  async remove(scope: DeletionScope, actorId: string, batchId: string): Promise<void> {
    const routeIds = scope.routes.map((r) => oid(r.id));
    const hqIds = scope.hqs.map((h) => oid(h.id));
    const zoneIds = scope.zones.map((z) => oid(z.id));
    const now = new Date();
    const by = oid(actorId);

    const rows = [
      ...scope.zones.map((z) => ({ kind: 'ZONE' as const, originalId: oid(z.id), name: z.name, batchId, deletedAt: now, deletedBy: by })),
      ...scope.hqs.map((h) => ({
        kind: 'HQ' as const,
        originalId: oid(h.id),
        name: h.name,
        zoneId: oid(h.zoneId),
        zoneName: h.zoneName,
        batchId,
        deletedAt: now,
        deletedBy: by,
      })),
      ...scope.routes.map((r) => ({
        kind: 'ROUTE' as const,
        originalId: oid(r.id),
        name: r.name,
        zoneId: r.zoneId ? oid(r.zoneId) : null,
        zoneName: r.zoneName,
        hqId: oid(r.hqId),
        hqName: r.hqName,
        routeType: r.type,
        destinationName: r.destinationName,
        distanceKm: decimal(r.distanceKm),
        taPerKmRateOverridePaise: r.taPerKmRateOverridePaise,
        batchId,
        deletedAt: now,
        deletedBy: by,
      })),
    ];

    await this.transactions.run(async (ctx) => {
      const session = ctx as ClientSession;
      if (rows.length) await TerritoryArchiveModel.insertMany(rows, { session });
      if (routeIds.length) await RouteAssignmentModel.deleteMany({ routeId: { $in: routeIds } }, { session });
      if (hqIds.length) {
        await UserHqAssignmentModel.updateMany(
          { hqId: { $in: hqIds }, status: 'active' },
          { $set: { status: 'inactive', unassignedAt: now, unassignedBy: by } },
          { session },
        );
      }
      if (hqIds.length || zoneIds.length) {
        await ManagerCoverageModel.updateMany(
          { $or: [{ hqIds: { $in: hqIds } }, { zoneIds: { $in: zoneIds } }] },
          { $pull: { hqIds: { $in: hqIds }, zoneIds: { $in: zoneIds } } },
          { session },
        );
      }
      if (routeIds.length) await RouteModel.deleteMany({ _id: { $in: routeIds } }, { session });
      if (hqIds.length) await HqModel.deleteMany({ _id: { $in: hqIds } }, { session });
      if (zoneIds.length) await ZoneModel.deleteMany({ _id: { $in: zoneIds } }, { session });
    });
  }

  async findArchived(kind: TerritoryKind, id: string): Promise<ArchivedItem | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await TerritoryArchiveModel.findOne({ kind, originalId: oid(id) }).lean();
    if (!doc) return null;
    return {
      kind: doc.kind,
      id: String(doc.originalId),
      name: doc.name,
      zoneId: doc.zoneId ? String(doc.zoneId) : null,
      zoneName: doc.zoneName,
      hqId: doc.hqId ? String(doc.hqId) : null,
      hqName: doc.hqName,
      routeType: (doc.routeType as RouteType | null) ?? null,
      distanceKm: doc.distanceKm?.toString() ?? null,
      taPerKmRateOverridePaise: doc.taPerKmRateOverridePaise,
    };
  }
}
