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
});

// Backs `findActiveByDeviceId`/`countActive` — always filtered by userId first.
userSessionSchema.index({ userId: 1, deviceId: 1 });

export const UserSessionModel = model<UserSessionDoc>('UserSession', userSessionSchema);
