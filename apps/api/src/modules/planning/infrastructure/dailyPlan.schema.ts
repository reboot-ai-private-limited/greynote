import { Schema, model, type Types } from 'mongoose';
import { planDaySchemaFields, type PlanDayDoc } from './planDoc.js';

export interface DailyPlanDoc extends PlanDayDoc {
  userId: Types.ObjectId;
  planDate: string;
  revision: number;
  lateResubmits: number;
  updatedAt: Date;
}

const dailyPlanSchema = new Schema<DailyPlanDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  // A calendar day as `YYYY-MM-DD` — sorts correctly as a string, and isn't an instant.
  planDate: { type: String, required: true },
  ...planDaySchemaFields,
  revision: { type: Number, required: true },
  lateResubmits: { type: Number, default: 0 },
  updatedAt: { type: Date, required: true },
});

// One plan per user per day; also serves "my plans between two dates".
dailyPlanSchema.index({ userId: 1, planDate: 1 }, { unique: true });

export const DailyPlanModel = model<DailyPlanDoc>('DailyPlan', dailyPlanSchema);
