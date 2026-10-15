import { Schema, model, type Types } from 'mongoose';

export interface ManagerCoverageDoc {
  userId: Types.ObjectId;
  hqIds: Types.ObjectId[];
  zoneIds: Types.ObjectId[];
  updatedAt: Date;
  updatedBy: Types.ObjectId;
}

const managerCoverageSchema = new Schema<ManagerCoverageDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', unique: true },
  hqIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Hq' },
  zoneIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Zone' },
  updatedAt: { type: Date, required: true },
  updatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
});

export const ManagerCoverageModel = model<ManagerCoverageDoc>('ManagerCoverage', managerCoverageSchema);
