import { Schema, model, type Types } from 'mongoose';

export interface SyncReceiptDoc {
  userId: Types.ObjectId;
  clientId: string;
  kind: string;
  serverId: string;
  syncedAt: Date;
}

/**
 * Long enough that a retry can still find its receipt: a record older than `SYNC_MAX_AGE_DAYS`
 * (seeded 7) is refused on its creation time anyway, so a receipt past this can never be asked for.
 */
export const RECEIPT_TTL_SECONDS = 90 * 24 * 60 * 60;

const syncReceiptSchema = new Schema<SyncReceiptDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  clientId: { type: String, required: true },
  kind: { type: String, required: true },
  serverId: { type: String, required: true },
  syncedAt: { type: Date, required: true },
});

// The idempotency key: one receipt per record the phone ever made, enforced by the database.
syncReceiptSchema.index({ userId: 1, clientId: 1 }, { unique: true });
syncReceiptSchema.index({ syncedAt: 1 }, { expireAfterSeconds: RECEIPT_TTL_SECONDS });

export const SyncReceiptModel = model<SyncReceiptDoc>('SyncReceipt', syncReceiptSchema);
