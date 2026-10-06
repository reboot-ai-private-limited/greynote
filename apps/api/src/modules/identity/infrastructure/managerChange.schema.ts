import { Schema, model, type Types } from 'mongoose';
import type { ManagerChangeSource } from '../domain/managerHistory.js';

export interface ManagerChangeDocument {
  userId: Types.ObjectId;
  managerId: Types.ObjectId | null;
  previousManagerId: Types.ObjectId | null;
  effectiveFrom: string;
  source: ManagerChangeSource;
  promotionId: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
}

const managerChangeSchema = new Schema<ManagerChangeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    managerId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
    previousManagerId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
    effectiveFrom: { type: String, required: true },
    source: { type: String, required: true, enum: ['PROFILE_EDIT', 'PROMOTION'] },
    promotionId: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

managerChangeSchema.index({ userId: 1, effectiveFrom: 1, createdAt: 1 });
// Backs "who reported to this manager in month M": the changes that name them as the new or the previous manager.
managerChangeSchema.index({ managerId: 1, effectiveFrom: 1 });
managerChangeSchema.index({ previousManagerId: 1, effectiveFrom: 1 });

export const ManagerChangeModel = model<ManagerChangeDocument>('ManagerChange', managerChangeSchema);
