import { Schema, model, type Types } from 'mongoose';
import {
  DISTANCE_SOURCES,
  DISTANCE_STATUSES,
  type DistanceSource,
  type DistanceStatus,
  type Waypoint,
} from '../domain/route.entity.js';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface RouteDoc {
  areaId: Types.ObjectId;
  name: string;
  nameKey: string;
  waypoints: Waypoint[];
  distanceKm: Types.Decimal128 | null;
  distanceSource: DistanceSource;
  distanceStatus: DistanceStatus;
  distanceCalculatedAt: Date | null;
  taPerKmRateOverride: Types.Decimal128 | null;
  revision: number;
  status: TerritoryStatus;
}

// Kept as an embedded array, not its own collection: waypoints are only ever read and written
// whole, with their route (ERD 02).
const waypointSchema = new Schema<Waypoint>(
  {
    label: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    placeId: { type: String, required: true },
  },
  { _id: false },
);

const routeSchema = new Schema<RouteDoc>({
  areaId: { type: Schema.Types.ObjectId, required: true, ref: 'Area' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  waypoints: { type: [waypointSchema], required: true },
  distanceKm: { type: Schema.Types.Decimal128, default: null },
  distanceSource: { type: String, required: true, enum: DISTANCE_SOURCES },
  distanceStatus: { type: String, required: true, enum: DISTANCE_STATUSES },
  distanceCalculatedAt: { type: Date, default: null },
  taPerKmRateOverride: { type: Schema.Types.Decimal128, default: null },
  revision: { type: Number, required: true },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "Routes in this Area" lists and the active-children count on Area deactivation.
routeSchema.index({ areaId: 1, nameKey: 1 }, { unique: true });

export const RouteModel = model<RouteDoc>('Route', routeSchema);
