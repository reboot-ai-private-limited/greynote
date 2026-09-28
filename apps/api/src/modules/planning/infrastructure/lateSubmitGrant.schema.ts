import { ROLE_NAMES, type RoleName } from '@greynote/contracts';
import { Schema, model, type Types } from 'mongoose';
import { GRANT_STATUSES, type GrantStatus } from '../domain/lateSubmitGrant.entity.js';
import { PLAN_KINDS, type PlanKind } from '../domain/plan.js';

export interface LateSubmitGrantDoc {
  userId: Types.ObjectId;
  kind: PlanKind;
  planKey: string;
  reason: string;
  grantedBy: Types.ObjectId;
  grantedByRole: RoleName;
  grantedAt: Date;
  expiresAt: Date;
  status: GrantStatus;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
}

const lateSubmitGrantSchema = new Schema<LateSubmitGrantDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  kind: { type: String, required: true, enum: PLAN_KINDS },
  planKey: { type: String, required: true },
  reason: { type: String, required: true },
  grantedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  grantedByRole: { type: String, required: true, enum: ROLE_NAMES },
  grantedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, required: true, enum: GRANT_STATUSES },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// At most one OPEN grant per Plan; any number of closed ones. Also serves the submit's lookup.
lateSubmitGrantSchema.index(
  { userId: 1, kind: 1, planKey: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } },
);
// The list screens: newest first, optionally per employee.
lateSubmitGrantSchema.index({ userId: 1, grantedAt: -1 });
lateSubmitGrantSchema.index({ grantedAt: -1 });

export const LateSubmitGrantModel = model<LateSubmitGrantDoc>('LateSubmitGrant', lateSubmitGrantSchema);
