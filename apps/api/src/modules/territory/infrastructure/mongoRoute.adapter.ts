import { Types, type UpdateQuery } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { Route } from '../domain/route.entity.js';
import type { RouteListQuery, RouteRepositoryPort } from '../domain/route.repository.port.js';
import { AreaModel } from './area.schema.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';
import { RouteModel, type RouteDoc } from './route.schema.js';

function toRoute(doc: RouteDoc & { _id: unknown }): Route {
  return {
    id: String(doc._id),
    areaId: String(doc.areaId),
    name: doc.name,
    waypoints: doc.waypoints.map(({ label, latitude, longitude, placeId }) => ({ label, latitude, longitude, placeId })),
    distanceKm: doc.distanceKm?.toString() ?? null,
    distanceSource: doc.distanceSource,
    distanceStatus: doc.distanceStatus,
    distanceCalculatedAt: doc.distanceCalculatedAt,
    taPerKmRateOverride: doc.taPerKmRateOverride?.toString() ?? null,
    revision: doc.revision,
    status: doc.status,
  };
}

const toDecimal = (value: string | null) => (value === null ? null : Types.Decimal128.fromString(value));

/** Domain → document: decimal strings become `Decimal128`, `name` also sets `nameKey`. */
function toDocChange(input: Partial<Omit<Route, 'id' | 'areaId'>>): UpdateQuery<RouteDoc> {
  const { name, distanceKm, taPerKmRateOverride, ...rest } = input;
  return {
    ...rest,
    ...(name !== undefined && { name, nameKey: toNameKey(name) }),
    ...(distanceKm !== undefined && { distanceKm: toDecimal(distanceKm) }),
    ...(taPerKmRateOverride !== undefined && { taPerKmRateOverride: toDecimal(taPerKmRateOverride) }),
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

  async findByName(areaId: string, name: string): Promise<Route | null> {
    const doc = await RouteModel.findOne({ areaId: new Types.ObjectId(areaId), nameKey: toNameKey(name) }).lean();
    return doc ? toRoute(doc) : null;
  }

  async list(query: RouteListQuery): Promise<{ items: Route[]; total: number }> {
    const { filter, sort, skip, limit } = listOptions<RouteDoc>(query);
    if (query.hqId) {
      // Routes don't store their HQ (always reached through the Area, ERD 02) — resolve it here.
      const areas = await AreaModel.find({ hqId: new Types.ObjectId(query.hqId) }).select('_id').lean();
      const areaIds = areas.map((a) => a._id);
      filter.areaId = query.areaId
        ? { $in: areaIds.filter((id) => String(id) === query.areaId) }
        : { $in: areaIds };
    } else if (query.areaId) {
      filter.areaId = new Types.ObjectId(query.areaId);
    }
    const [docs, total] = await Promise.all([
      RouteModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      RouteModel.countDocuments(filter),
    ]);
    return { items: docs.map(toRoute), total };
  }

  countActiveInArea(areaId: string): Promise<number> {
    return RouteModel.countDocuments({ areaId: new Types.ObjectId(areaId), status: 'active' });
  }

  async create(input: Omit<Route, 'id'>): Promise<Route> {
    try {
      const doc = await RouteModel.create({ ...toDocChange(input), areaId: new Types.ObjectId(input.areaId) });
      return toRoute(doc.toObject());
    } catch (err) {
      return rethrowDuplicateName(err, 'route');
    }
  }

  async update(id: string, input: Partial<Pick<Route, 'name' | 'status' | 'taPerKmRateOverride'>>): Promise<Route> {
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
    change: Partial<Omit<Route, 'id' | 'areaId'>>,
  ): Promise<Route | null> {
    const doc = await RouteModel.findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      { ...toDocChange(change), $inc: { revision: 1 } },
      { new: true },
    ).lean();
    return doc ? toRoute(doc) : null;
  }
}
