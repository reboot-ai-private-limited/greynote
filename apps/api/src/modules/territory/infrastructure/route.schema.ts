import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import type { Place } from '../domain/place.js';
import {
  DISTANCE_SOURCES,
  DISTANCE_STATUSES,
  ROUTE_TYPES,
  ROUTE_TYPE_SOURCES,
  type RouteTypeSource,
  type DistanceSource,
  type DistanceStatus,
  type RouteType,
} from '../domain/route.entity.js';
import { placeSchema } from './hq.schema.js';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface RouteDoc {
  hqId: Types.ObjectId;
  name: string;
  nameKey: string;
  type: RouteType;
  typeSource?: RouteTypeSource;
  destination: Place;
  distanceKm: Types.Decimal128 | null;
  distanceSource: DistanceSource;
  distanceStatus: DistanceStatus;
  distanceCalculatedAt: Date | null;
  taPerKmRateOverridePaise: number | null;
  revision: number;
  status: TerritoryStatus;
}

const routeSchema = new Schema<RouteDoc>({
  hqId: { type: Schema.Types.ObjectId, required: true, ref: 'Hq' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  type: { type: String, required: true, enum: ROUTE_TYPES },
  // Routes saved before this field existed have none: they read as MANUAL, so nothing about them changes.
  typeSource: { type: String, enum: ROUTE_TYPE_SOURCES, default: 'MANUAL' },
  destination: { type: placeSchema, required: true },
  distanceKm: { type: Schema.Types.Decimal128, default: null },
  distanceSource: { type: String, required: true, enum: DISTANCE_SOURCES },
  distanceStatus: { type: String, required: true, enum: DISTANCE_STATUSES },
  distanceCalculatedAt: { type: Date, default: null },
  taPerKmRateOverridePaise: { type: Number, default: null, validate: { validator: (v: unknown) => v === null || isPaise(v), message: 'Must be a whole number of paise.' } },
  revision: { type: Number, required: true },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "Routes of this HQ" lists and the active-children count on HQ deactivation.
routeSchema.index({ hqId: 1, nameKey: 1 }, { unique: true });

export const RouteModel = model<RouteDoc>('Route', routeSchema);
