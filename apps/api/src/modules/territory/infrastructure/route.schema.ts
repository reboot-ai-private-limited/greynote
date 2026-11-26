import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { ROUTE_TYPES, ROUTE_TYPE_SOURCES, type RouteTypeSource, type RouteType } from '../domain/route.entity.js';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface RouteDoc {
  hqId: Types.ObjectId;
  name: string;
  nameKey: string;
  type: RouteType;
  typeSource?: RouteTypeSource;
  destinationName: string;
  distanceKm: Types.Decimal128 | null;
  taPerKmRateOverridePaise: number | null;
  taFixedPaise?: number | null;
  fromPlaceId?: Types.ObjectId | null;
  toPlaceId?: Types.ObjectId | null;
  /** `pairKeyOf(from, to)`: one route per pair of places, whichever way round. Absent on a route not yet migrated. */
  pairKey?: string | null;
  status: TerritoryStatus;
}

const routeSchema = new Schema<RouteDoc>({
  hqId: { type: Schema.Types.ObjectId, required: true, ref: 'Hq' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  type: { type: String, required: true, enum: ROUTE_TYPES },
  // Routes saved before this field existed have none: they read as MANUAL, so nothing about them changes.
  typeSource: { type: String, enum: ROUTE_TYPE_SOURCES, default: 'MANUAL' },
  destinationName: { type: String, required: true },
  distanceKm: { type: Schema.Types.Decimal128, default: null },
  taPerKmRateOverridePaise: { type: Number, default: null, validate: { validator: (v: unknown) => v === null || isPaise(v), message: 'Must be a whole number of paise.' } },
  taFixedPaise: { type: Number, default: null, validate: { validator: (v: unknown) => v === null || isPaise(v), message: 'Must be a whole number of paise.' } },
  fromPlaceId: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
  toPlaceId: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
  pairKey: { type: String, default: null },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "Routes of this HQ" lists and the active-children count on HQ deactivation.
routeSchema.index({ hqId: 1, nameKey: 1 }, { unique: true });
routeSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } }, name: 'one_route_per_place_pair' });
// Routes from or to a place: the To picker and a place's rename.
routeSchema.index({ fromPlaceId: 1 });
routeSchema.index({ toPlaceId: 1 });

export const RouteModel = model<RouteDoc>('Route', routeSchema);
