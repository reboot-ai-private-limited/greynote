import { Schema, model } from 'mongoose';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface ZoneDoc {
  name: string;
  nameKey: string;
  status: TerritoryStatus;
}

const zoneSchema = new Schema<ZoneDoc>({
  name: { type: String, required: true },
  nameKey: { type: String, required: true, unique: true },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
});

export const ZoneModel = model<ZoneDoc>('Zone', zoneSchema);
