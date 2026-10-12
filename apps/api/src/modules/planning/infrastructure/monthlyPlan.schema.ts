import { Schema, model, type Types } from 'mongoose';
import { planDaySchemaFields, type PlanDayDoc } from './planDoc.js';

export interface MonthlyPlanEntryDoc extends PlanDayDoc {
  planDate: string;
  returnDate?: string | null;
}

export interface MonthlyPlanDoc {
  userId: Types.ObjectId;
  planMonth: string;
  entries: MonthlyPlanEntryDoc[];
  revision: number;
  lateResubmits: number;
  updatedAt: Date;
}

// Embedded: at most 31, always saved and submitted with their month, so one document keeps each
// write atomic.
const entrySchema = new Schema<MonthlyPlanEntryDoc>(
  { planDate: { type: String, required: true }, returnDate: { type: String, default: null }, ...planDaySchemaFields },
  { _id: false },
);

const monthlyPlanSchema = new Schema<MonthlyPlanDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  // `YYYY-MM` — sorts correctly as a string.
  planMonth: { type: String, required: true },
  entries: { type: [entrySchema], default: [] },
  revision: { type: Number, required: true },
  lateResubmits: { type: Number, default: 0 },
  updatedAt: { type: Date, required: true },
});

// One plan per user per month; also serves "my plans between two months".
monthlyPlanSchema.index({ userId: 1, planMonth: 1 }, { unique: true });

export const MonthlyPlanModel = model<MonthlyPlanDoc>('MonthlyPlan', monthlyPlanSchema);
