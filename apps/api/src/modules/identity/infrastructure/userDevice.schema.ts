import { Schema, model, type Types } from 'mongoose';
import { DEVICE_STATUSES, LIVE_DEVICE_STATUSES, type DeviceStatus } from '../domain/userDevice.entity.js';
import { PLATFORMS, type Platform } from '../domain/userSession.entity.js';

export interface UserDeviceDoc {
  userId: Types.ObjectId;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: Platform;
  status: DeviceStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: Types.ObjectId | null;
  expiresAt: Date | null;
}

const userDeviceSchema = new Schema<UserDeviceDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  deviceId: { type: String, required: true },
  deviceName: { type: String, required: true },
  deviceModel: { type: String, required: true },
  platform: { type: String, required: true, enum: PLATFORMS },
  status: { type: String, required: true, enum: DEVICE_STATUSES },
  requestedAt: { type: Date, required: true },
  decidedAt: { type: Date, default: null },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: null },
});

// One live row per phone per employee; REMOVED rows are history and don't count.
userDeviceSchema.index(
  { userId: 1, deviceId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: [...LIVE_DEVICE_STATUSES] } } },
);
// Deletes a REJECTED row once its expiresAt passes (only REJECTED rows set it).
userDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userDeviceSchema.index({ status: 1, requestedAt: 1 });

export const UserDeviceModel = model<UserDeviceDoc>('UserDevice', userDeviceSchema);
