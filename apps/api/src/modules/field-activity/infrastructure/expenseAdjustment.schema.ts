import { ROLE_NAMES, type RoleName } from '@greynote/contracts';
import { Schema, model, type Types } from 'mongoose';

export interface ExpenseAdjustmentDoc {
  userId: Types.ObjectId;
  month: string;
  reportDate: string;
  expenseId: Types.ObjectId;
  type: 'TA' | 'DA' | 'OTHER' | 'TRAVEL' | 'MEAL' | 'MISC';
  kind: 'EDIT' | 'ADD';
  beforePaise: number;
  afterPaise: number;
  reason: string;
  by: Types.ObjectId;
  byRole: RoleName;
  at: Date;
}

const expenseAdjustmentSchema = new Schema<ExpenseAdjustmentDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true },
  reportDate: { type: String, required: true },
  expenseId: { type: Schema.Types.ObjectId, required: true, ref: 'Expense' },
  type: { type: String, required: true, enum: ['TA', 'DA', 'OTHER', 'TRAVEL', 'MEAL', 'MISC'] },
  kind: { type: String, required: true, enum: ['EDIT', 'ADD'] },
  beforePaise: { type: Number, required: true, min: 0 },
  afterPaise: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true },
  by: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  byRole: { type: String, required: true, enum: ROLE_NAMES },
  at: { type: Date, required: true },
});
// Append-only: the review reads one employee's month.
expenseAdjustmentSchema.index({ userId: 1, month: 1, at: 1 });
expenseAdjustmentSchema.index({ expenseId: 1, at: 1 });

export const ExpenseAdjustmentModel = model<ExpenseAdjustmentDoc>('ExpenseAdjustment', expenseAdjustmentSchema);
