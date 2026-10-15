import { Schema, model, type Types } from 'mongoose';
import { PLATFORMS, REVOKED_REASONS, type Platform, type RevokedReason } from '../domain/userSession.entity.js';

export interface UserSessionDoc {
  userId: Types.ObjectId;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: Platform;
  refreshTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
  revokedAt: Date | null;
  revokedReason: RevokedReason | null;
  pushToken?: string | null;
  pushTokenAt?: Date | null;
}

const userSessionSchema = new Schema<UserSessionDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  deviceId: { type: String, required: true },
  deviceName: { type: String, required: true },
  deviceModel: { type: String, required: true },
  platform: { type: String, required: true, enum: PLATFORMS },
  refreshTokenHash: { type: String, required: true, unique: true },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  lastActiveAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String, enum: [...REVOKED_REASONS, null], default: null },
  pushToken: { type: String, default: null },
  pushTokenAt: { type: Date, default: null },
});

// Backs the push lookups: tokens of a user's live sessions, and clearing a token that moved to another account.
userSessionSchema.index({ pushToken: 1 }, { sparse: true });

// Backs `findActiveByDeviceId`/`countActive` — always filtered by userId first.
userSessionSchema.index({ userId: 1, deviceId: 1 });

export const UserSessionModel = model<UserSessionDoc>('UserSession', userSessionSchema);
