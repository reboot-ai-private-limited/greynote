import { Types, type UpdateQuery } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { Route } from '../domain/route.entity.js';
import type { RouteListQuery, RouteRepositoryPort } from '../domain/route.repository.port.js';
import { HqModel } from './hq.schema.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';
import { RouteModel, type RouteDoc } from './route.schema.js';

function toRoute(doc: RouteDoc & { _id: unknown }): Route {
  return {
    id: String(doc._id),
    hqId: String(doc.hqId),
    name: doc.name,
    type: doc.type,
    typeSource: doc.typeSource ?? 'MANUAL',
    destination: {
      label: doc.destination.label,
      latitude: doc.destination.latitude,
      longitude: doc.destination.longitude,
      placeId: doc.destination.placeId,
    },
    distanceKm: doc.distanceKm?.toString() ?? null,
    distanceSource: doc.distanceSource,
    distanceStatus: doc.distanceStatus,
    distanceCalculatedAt: doc.distanceCalculatedAt,
    taPerKmRateOverridePaise: doc.taPerKmRateOverridePaise ?? null,
    revision: doc.revision,
    status: doc.status,
  };
}

const toDecimal = (value: string | null) => (value === null ? null : Types.Decimal128.fromString(value));

/** Domain → document: the distance string becomes `Decimal128`, `name` also sets `nameKey`. */
function toDocChange(input: Partial<Omit<Route, 'id' | 'hqId'>>): UpdateQuery<RouteDoc> {
  const { name, distanceKm, ...rest } = input;
  return {
    ...rest,
    ...(name !== undefined && { name, nameKey: toNameKey(name) }),
    ...(distanceKm !== undefined && { distanceKm: toDecimal(distanceKm) }),
  };
}

export class MongoRouteAdapter implements RouteRepositoryPort {
  async findById(id: string): Promise<Route | null> {
    const doc = await RouteModel.findById(id).lean();
    return doc ? toRoute(doc) : null;
  }

  async findByIds(ids: string[]): Promise<Route[]> {
    if (ids.length === 0) return [];
    const docs = await RouteModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }).lean();
    return docs.map(toRoute);
  }

  async findByName(hqId: string, name: string): Promise<Route | null> {
    const doc = await RouteModel.findOne({ hqId: new Types.ObjectId(hqId), nameKey: toNameKey(name) }).lean();
    return doc ? toRoute(doc) : null;
  }

  async listIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]> {
    // The most specific level given wins: HQ, then Zone.
    let hqIds: Types.ObjectId[];
    if (scope.hqId) hqIds = [new Types.ObjectId(scope.hqId)];
    else if (scope.zoneId) hqIds = await this.hqIdsInZone(scope.zoneId);
    else return [];
    return (await RouteModel.find({ hqId: { $in: hqIds } }).select('_id').lean()).map((r) => String(r._id));
  }

  private async hqIdsInZone(zoneId: string): Promise<Types.ObjectId[]> {
    return (await HqModel.find({ zoneId: new Types.ObjectId(zoneId) }).select('_id').lean()).map((h) => h._id);
  }

  async list(query: RouteListQuery): Promise<{ items: Route[]; total: number }> {
    const { filter, sort, skip, limit } = listOptions<RouteDoc>(query);
    if (query.hqId) {
      filter.hqId = new Types.ObjectId(query.hqId);
    } else if (query.zoneId) {
      // Routes store only their HQ (Zone is reached through it, ERD 02) — resolve the Zone's HQs here.
      filter.hqId = { $in: await this.hqIdsInZone(query.zoneId) };
    }
    if (query.type) filter.type = query.type;
    const [docs, total] = await Promise.all([
      RouteModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      RouteModel.countDocuments(filter),
    ]);
    return { items: docs.map(toRoute), total };
  }

  countActiveInHq(hqId: string): Promise<number> {
    return RouteModel.countDocuments({ hqId: new Types.ObjectId(hqId), status: 'active' });
  }

  async listActiveInHq(hqId: string): Promise<Route[]> {
    const docs = await RouteModel.find({ hqId: new Types.ObjectId(hqId), status: 'active' }).lean();
    return docs.map(toRoute);
  }

  async create(input: Omit<Route, 'id'>): Promise<Route> {
    try {
      const doc = await RouteModel.create({ ...toDocChange(input), hqId: new Types.ObjectId(input.hqId) });
      return toRoute(doc.toObject());
    } catch (err) {
      return rethrowDuplicateName(err, 'route');
    }
  }

  async update(id: string, input: Partial<Pick<Route, 'name' | 'type' | 'typeSource' | 'status' | 'taPerKmRateOverridePaise'>>): Promise<Route> {
    try {
      const doc = await RouteModel.findByIdAndUpdate(id, toDocChange(input), { new: true }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'ROUTE_NOT_FOUND', id });
      return toRoute(doc);
    } catch (err) {
      return rethrowDuplicateName(err, 'route');
    }
  }

  async updateAtRevision(
    id: string,
    expectedRevision: number,
    change: Partial<Omit<Route, 'id' | 'hqId'>>,
  ): Promise<Route | null> {
    const doc = await RouteModel.findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      { ...toDocChange(change), $inc: { revision: 1 } },
      { new: true },
    ).lean();
    return doc ? toRoute(doc) : null;
  }
}
