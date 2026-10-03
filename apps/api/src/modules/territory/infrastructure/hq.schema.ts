import { Schema, model, type Types } from 'mongoose';
import type { Place } from '../domain/place.js';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface HqDoc {
  zoneId: Types.ObjectId;
  name: string;
  nameKey: string;
  basePlace: Place | null;
  status: TerritoryStatus;
}

export const placeSchema = new Schema<Place>(
  {
    label: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    placeId: { type: String, required: true },
  },
  { _id: false },
);

const hqSchema = new Schema<HqDoc>({
  zoneId: { type: Schema.Types.ObjectId, required: true, ref: 'Zone' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  basePlace: { type: placeSchema, default: null },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "HQs in this Zone" lists and the active-children count on Zone deactivation.
hqSchema.index({ zoneId: 1, nameKey: 1 }, { unique: true });

export const HqModel = model<HqDoc>('Hq', hqSchema);
