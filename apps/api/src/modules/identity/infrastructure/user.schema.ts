import { Schema, model, type Types } from 'mongoose';
import type { UserStatus } from '../domain/user.entity.js';

export interface UserDoc {
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roleId: Types.ObjectId;
  passwordHash: string;
  lastLoginAt: Date | null;
  isBlocked: boolean;
  deletedAt?: Date | null;
  isDemo?: boolean;
}

const userSchema = new Schema<UserDoc>({
  employeeCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  status: { type: String, required: true, enum: ['active', 'pending', 'inactive'] },
  roleId: { type: Schema.Types.ObjectId, required: true, ref: 'Role' },
  passwordHash: { type: String, required: true },
  lastLoginAt: { type: Date, default: null },
  isBlocked: { type: Boolean, required: true, default: false },
  deletedAt: { type: Date, default: null },
  isDemo: { type: Boolean, default: false },
});

// `sparse: true` on the field alone doesn't work here — every FIELD user's `email` is explicitly
// set to `null` (not omitted), and a sparse index only excludes documents where the key is
// genuinely ABSENT, not ones present with a null value. A partial index that only indexes actual
// string emails is what actually lets multiple `null`-email users coexist.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

export const UserModel = model<UserDoc>('User', userSchema);
