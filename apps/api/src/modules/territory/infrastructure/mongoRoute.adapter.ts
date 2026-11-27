import { Types, type UpdateQuery } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import { pairKeyOf } from '../domain/place.entity.js';
import type { Route, RouteChange } from '../domain/route.entity.js';
import type { RouteListQuery, RouteRepositoryPort } from '../domain/route.repository.port.js';
import { HqModel } from './hq.schema.js';
import { PlaceModel } from './place.schema.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';
import { RouteModel, type RouteDoc } from './route.schema.js';

function toRoute(doc: RouteDoc & { _id: unknown }): Route {
  return {
    id: String(doc._id),
    hqId: String(doc.hqId),
    name: doc.name,
    type: doc.type,
    typeSource: doc.typeSource ?? 'MANUAL',
    destinationName: doc.destinationName,
    distanceKm: doc.distanceKm?.toString() ?? null,
    taPerKmRateOverridePaise: doc.taPerKmRateOverridePaise ?? null,
    taFixedPaise: doc.taFixedPaise ?? null,
    fromPlaceId: doc.fromPlaceId ? String(doc.fromPlaceId) : null,
    toPlaceId: doc.toPlaceId ? String(doc.toPlaceId) : null,
    status: doc.status,
  };
}

const toDecimal = (value: string | null) => (value === null ? null : Types.Decimal128.fromString(value));

const toObjectId = (value: string | null) => (value === null ? null : new Types.ObjectId(value));

/**
 * Domain → document: the distance string becomes `Decimal128`, `name` also sets `nameKey`, and the two place ids
 * set `pairKey`. Both ends are always written together (the use cases never move only one).
 */
function toDocChange(input: Partial<Omit<Route, 'id' | 'hqId'>>): UpdateQuery<RouteDoc> {
  const { name, distanceKm, fromPlaceId, toPlaceId, ...rest } = input;
  const ends = fromPlaceId !== undefined && toPlaceId !== undefined;
  return {
    ...rest,
    ...(name !== undefined && { name, nameKey: toNameKey(name) }),
    ...(distanceKm !== undefined && { distanceKm: toDecimal(distanceKm) }),
    ...(ends && {
      fromPlaceId: toObjectId(fromPlaceId),
      toPlaceId: toObjectId(toPlaceId),
      pairKey: fromPlaceId && toPlaceId ? pairKeyOf(fromPlaceId, toPlaceId) : null,
    }),
  };
}

function rethrowDuplicateRoute(err: unknown): never {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (e.code === 11000 && e.keyPattern && 'pairKey' in e.keyPattern) {
    throw AppError.conflict('A route between these two places already exists.', { field: 'toPlaceId' });
  }
  return rethrowDuplicateName(err, 'route');
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
    if (query.placeId) {
      const place = new Types.ObjectId(query.placeId);
      filter.$or = [{ fromPlaceId: place }, { toPlaceId: place }];
    } else if (query.touchingHqId) {
      const placeIds = (await PlaceModel.find({ hqId: new Types.ObjectId(query.touchingHqId) }).select('_id').lean()).map((p) => p._id);
      filter.$or = [{ fromPlaceId: { $in: placeIds } }, { toPlaceId: { $in: placeIds } }, { hqId: new Types.ObjectId(query.touchingHqId), fromPlaceId: null }];
    }
    const [docs, total] = await Promise.all([
      RouteModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      RouteModel.countDocuments(filter),
    ]);
    return { items: docs.map(toRoute), total };
  }

  countActiveInHq(hqId: string): Promise<number> {
    return RouteModel.countDocuments({ hqId: new Types.ObjectId(hqId), status: 'active' });
  }

  async listInHq(hqId: string): Promise<Route[]> {
    const docs = await RouteModel.find({ hqId: new Types.ObjectId(hqId) }).lean();
    return docs.map(toRoute);
  }

  async listActiveWithinHqs(hqIds: string[]): Promise<Route[]> {
    if (hqIds.length === 0) return [];
    const hqs = hqIds.map((id) => new Types.ObjectId(id));
    const placeIds = (await PlaceModel.find({ hqId: { $in: hqs } }).select('_id').lean()).map((p) => p._id);
    const docs = await RouteModel.find({
      status: 'active',
      $or: [
        { fromPlaceId: { $in: placeIds }, toPlaceId: { $in: placeIds } },
        { hqId: { $in: hqs }, fromPlaceId: null },
      ],
    }).lean();
    return docs.map(toRoute);
  }

  async findByPair(placeA: string, placeB: string): Promise<Route | null> {
    const doc = await RouteModel.findOne({ pairKey: pairKeyOf(placeA, placeB) }).lean();
    return doc ? toRoute(doc) : null;
  }

  async listTouchingPlace(placeId: string): Promise<Route[]> {
    const place = new Types.ObjectId(placeId);
    const docs = await RouteModel.find({ $or: [{ fromPlaceId: place }, { toPlaceId: place }] }).lean();
    return docs.map(toRoute);
  }

  countActiveTouchingPlace(placeId: string): Promise<number> {
    const place = new Types.ObjectId(placeId);
    return RouteModel.countDocuments({ status: 'active', $or: [{ fromPlaceId: place }, { toPlaceId: place }] });
  }

  async create(input: Omit<Route, 'id'>): Promise<Route> {
    try {
      const doc = await RouteModel.create({ ...toDocChange(input), hqId: new Types.ObjectId(input.hqId) });
      return toRoute(doc.toObject());
    } catch (err) {
      return rethrowDuplicateRoute(err);
    }
  }

  async update(id: string, input: RouteChange): Promise<Route> {
    try {
      const doc = await RouteModel.findByIdAndUpdate(id, toDocChange(input), { new: true }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'ROUTE_NOT_FOUND', id });
      return toRoute(doc);
    } catch (err) {
      return rethrowDuplicateRoute(err);
    }
  }
}
