import { Schema, model, type Types } from 'mongoose';
import { ROUTE_TYPES, type RouteType } from '../domain/route.entity.js';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface PlaceDoc {
  hqId: Types.ObjectId;
  name: string;
  nameKey: string;
  type: RouteType;
  isHqTown: boolean;
  status: TerritoryStatus;
}

const placeSchema = new Schema<PlaceDoc>({
  hqId: { type: Schema.Types.ObjectId, required: true, ref: 'Hq' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  type: { type: String, required: true, enum: ROUTE_TYPES },
  isHqTown: { type: Boolean, required: true, default: false },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Names unique per HQ, ignoring case; also serves "places of this HQ" lists.
placeSchema.index({ hqId: 1, nameKey: 1 }, { unique: true });
// One HQ town per HQ.
placeSchema.index({ hqId: 1 }, { unique: true, partialFilterExpression: { isHqTown: true }, name: 'one_hq_town_per_hq' });

export const PlaceModel = model<PlaceDoc>('Place', placeSchema);
