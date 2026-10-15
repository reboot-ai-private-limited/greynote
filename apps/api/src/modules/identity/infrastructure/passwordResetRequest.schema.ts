import { Schema, model, type Types } from 'mongoose';

export interface PasswordResetRequestDoc {
  userId: Types.ObjectId;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
  createdAt: Date;
}

const passwordResetRequestSchema = new Schema<PasswordResetRequestDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, required: true, default: 0 },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, required: true },
});

passwordResetRequestSchema.index({ userId: 1, createdAt: -1 });
// Cleared two days after creation: long enough for the 24-hour cap to count them, short enough to keep nothing around.
passwordResetRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60, name: 'createdAt_ttl' });

export const PasswordResetRequestModel = model<PasswordResetRequestDoc>('PasswordResetRequest', passwordResetRequestSchema);
