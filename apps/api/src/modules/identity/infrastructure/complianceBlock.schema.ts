import { Schema, model, type Types } from 'mongoose';

export interface ComplianceBlockDoc {
  userId: Types.ObjectId;
  reason: string;
  blockedAt: Date;
  unblockedBy: Types.ObjectId | null;
  unblockedAt: Date | null;
}

const complianceBlockSchema = new Schema<ComplianceBlockDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  reason: { type: String, required: true },
  blockedAt: { type: Date, required: true },
  unblockedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  unblockedAt: { type: Date, default: null },
});

// Backs `findOpenByUserId` — always filtered by userId first, then the open (unblockedAt: null) one.
complianceBlockSchema.index({ userId: 1, unblockedAt: 1 });

export const ComplianceBlockModel = model<ComplianceBlockDoc>('ComplianceBlock', complianceBlockSchema);
