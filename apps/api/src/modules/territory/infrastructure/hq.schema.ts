import { Schema, model, type Types } from 'mongoose';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface HqDoc {
  zoneId: Types.ObjectId;
  name: string;
  nameKey: string;
  status: TerritoryStatus;
}

const hqSchema = new Schema<HqDoc>({
  zoneId: { type: Schema.Types.ObjectId, required: true, ref: 'Zone' },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

// Also serves "HQs in this Zone" lists and the active-children count on Zone deactivation.
hqSchema.index({ zoneId: 1, nameKey: 1 }, { unique: true });

export const HqModel = model<HqDoc>('Hq', hqSchema);
