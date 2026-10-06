import { Schema, model } from 'mongoose';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface SpecialtyDoc {
  name: string;
  /** Lower-cased, trimmed name — unique, so "ent" and "ENT" can't both exist. */
  nameKey: string;
  status: MasterStatus;
}

const specialtySchema = new Schema<SpecialtyDoc>({
  name: { type: String, required: true },
  nameKey: { type: String, required: true, unique: true },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});

export const SpecialtyModel = model<SpecialtyDoc>('Specialty', specialtySchema);
