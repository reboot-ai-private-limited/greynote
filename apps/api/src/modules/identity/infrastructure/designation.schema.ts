import { Schema, model } from 'mongoose';
import { DESIGNATION_NAMES, type DesignationName } from '../domain/designation.entity.js';

interface DesignationDocument {
  name: DesignationName;
  /** Legacy: the level now follows from the name, so this is no longer read. */
  level?: number;
}

const designationSchema = new Schema<DesignationDocument>({
  name: { type: String, required: true, unique: true, enum: DESIGNATION_NAMES },
  level: { type: Number },
});

export const DesignationModel = model<DesignationDocument>('Designation', designationSchema);
