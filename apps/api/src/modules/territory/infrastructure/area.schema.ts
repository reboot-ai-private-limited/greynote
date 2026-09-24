import { Schema, model, type Types } from 'mongoose';
import { AREA_TYPES, type AreaType } from '../domain/area.entity.js';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface AreaDoc {
  hqId: Types.ObjectId;
  name: string;
  nameKey: string;
  type: AreaType;
  status: TerritoryStatus;
}

const areaSchema = new Schema<AreaDoc>({
  hqId: { type: Schema.Types.ObjectId, required: true, ref: 'Hq' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  type: { type: String, required: true, enum: AREA_TYPES },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "Areas in this HQ" lists and the active-children count on HQ deactivation.
areaSchema.index({ hqId: 1, nameKey: 1 }, { unique: true });

export const AreaModel = model<AreaDoc>('Area', areaSchema);
