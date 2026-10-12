import { ROLE_NAMES, type RoleName } from '@greynote/contracts';
import { Schema, model, type Types } from 'mongoose';
import { EXPENSE_GRANT_PHASES, EXPENSE_GRANT_STATUSES, type ExpenseGrantPhase, type ExpenseGrantStatus } from '../domain/expenseMonthGrant.entity.js';

export interface ExpenseMonthGrantDoc {
  userId: Types.ObjectId;
  month: string;
  phase: ExpenseGrantPhase;
  reason: string;
  grantedBy: Types.ObjectId;
  grantedByRole: RoleName;
  grantedAt: Date;
  expiresAt: Date;
  status: ExpenseGrantStatus;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
}

const expenseMonthGrantSchema = new Schema<ExpenseMonthGrantDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true },
  phase: { type: String, required: true, enum: EXPENSE_GRANT_PHASES },
  reason: { type: String, required: true },
  grantedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  grantedByRole: { type: String, required: true, enum: ROLE_NAMES },
  grantedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, required: true, enum: EXPENSE_GRANT_STATUSES },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// At most one OPEN grant per employee, month and phase; any number of closed ones. Also serves the lookup.
expenseMonthGrantSchema.index({ userId: 1, month: 1, phase: 1 }, { unique: true, partialFilterExpression: { status: 'OPEN' } });
expenseMonthGrantSchema.index({ userId: 1, grantedAt: -1 });
expenseMonthGrantSchema.index({ grantedAt: -1 });

export const ExpenseMonthGrantModel = model<ExpenseMonthGrantDoc>('ExpenseMonthGrant', expenseMonthGrantSchema);
