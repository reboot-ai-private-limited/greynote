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
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "Routes of this HQ" lists and the active-children count on HQ deactivation.
routeSchema.index({ hqId: 1, nameKey: 1 }, { unique: true });

export const RouteModel = model<RouteDoc>('Route', routeSchema);
