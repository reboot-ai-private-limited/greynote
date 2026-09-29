import { Schema, model, type Types } from 'mongoose';

export interface SyncDraftDoc {
  userId: Types.ObjectId;
  clientId: string;
  kind: string;
  clientUpdatedAt: Date;
  payload: unknown;
  deleted: boolean;
  /** When the server last stored it. */
  updatedAt: Date;
  /** Purged by a TTL index at this instant — set from `SYNC_DRAFT_TTL_DAYS` at write time, so the setting is live. */
  expiresAt: Date;
}

const syncDraftSchema = new Schema<SyncDraftDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  clientId: { type: String, required: true },
  kind: { type: String, required: true },
  clientUpdatedAt: { type: Date, required: true },
  payload: { type: Schema.Types.Mixed, default: null },
  deleted: { type: Boolean, required: true, default: false },
  updatedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

// One draft per record per user, enforced by the database — the guard behind last-write-wins.
syncDraftSchema.index({ userId: 1, clientId: 1 }, { unique: true });
// Restore pages through a user's live drafts.
syncDraftSchema.index({ userId: 1, deleted: 1, _id: 1 });
// Abandoned drafts and old tombstones clean themselves up: each row carries its own expiry.
syncDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SyncDraftModel = model<SyncDraftDoc>('SyncDraft', syncDraftSchema);
