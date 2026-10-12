import { Schema, model, type Types } from 'mongoose';

export interface ComplianceBlockDoc {
  userId: Types.ObjectId;
  reason: string;
  blockedAt: Date;
  unblockedBy: Types.ObjectId | null;
  unblockedAt: Date | null;
  unblockedByRole?: string | null;
  unblockReason?: string | null;
}

const complianceBlockSchema = new Schema<ComplianceBlockDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  reason: { type: String, required: true },
  blockedAt: { type: Date, required: true },
  unblockedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  unblockedAt: { type: Date, default: null },
  unblockedByRole: { type: String, default: null },
  unblockReason: { type: String, default: null },
});

// Backs `findOpenByUserId` — always filtered by userId first, then the open (unblockedAt: null) one.
complianceBlockSchema.index({ userId: 1, unblockedAt: 1 });
// At most ONE open block per user, enforced by the database, so two runs of the compliance job (or a job
// racing an Admin) can't leave two open events of which Unblock would close only one.
complianceBlockSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { unblockedAt: null } });

export const ComplianceBlockModel = model<ComplianceBlockDoc>('ComplianceBlock', complianceBlockSchema);
