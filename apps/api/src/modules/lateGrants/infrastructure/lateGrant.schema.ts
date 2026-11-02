import { ROLE_NAMES, type RoleName } from '@greynote/contracts';
import { Schema, model, type Types } from 'mongoose';
import { LATE_GRANT_KINDS, LATE_GRANT_STATUSES, type LateGrantKind, type LateGrantStatus } from '../domain/lateGrant.entity.js';

export interface LateGrantDoc {
  userId: Types.ObjectId;
  kind: LateGrantKind;
  periodKey: string;
  reason: string;
  grantedBy: Types.ObjectId;
  grantedByRole: RoleName;
  grantedAt: Date;
  expiresAt: Date;
  status: LateGrantStatus;
  usedAt: Date | null;
  usedRef: string | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
}

const lateGrantSchema = new Schema<LateGrantDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  kind: { type: String, required: true, enum: LATE_GRANT_KINDS },
  periodKey: { type: String, required: true },
  reason: { type: String, required: true },
  grantedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  grantedByRole: { type: String, required: true, enum: ROLE_NAMES },
  grantedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, required: true, enum: LATE_GRANT_STATUSES },
  usedAt: { type: Date, default: null },
  usedRef: { type: String, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// At most one OPEN grant per employee, kind and period; also serves the deadline checks' lookup.
lateGrantSchema.index({ userId: 1, kind: 1, periodKey: 1 }, { unique: true, partialFilterExpression: { status: 'OPEN' } });
lateGrantSchema.index({ userId: 1, grantedAt: -1 });
lateGrantSchema.index({ grantedAt: -1 });

export const LateGrantModel = model<LateGrantDoc>('LateGrant', lateGrantSchema);
