import { Schema, model, type Types } from 'mongoose';
import { WORKING_TYPES, type WorkingType } from '../domain/plan.js';

export interface DailyPlanDoc {
  userId: Types.ObjectId;
  planDate: string;
  workingType: WorkingType;
  workWith: Types.ObjectId[];
  routeIds: Types.ObjectId[];
  remarks: string | null;
  revision: number;
  updatedAt: Date;
}

const dailyPlanSchema = new Schema<DailyPlanDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  // A calendar day as `YYYY-MM-DD` — sorts correctly as a string, and isn't an instant.
  planDate: { type: String, required: true },
  workingType: { type: String, required: true, enum: WORKING_TYPES },
  workWith: { type: [Schema.Types.ObjectId], default: [], ref: 'User' },
  routeIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Route' },
  remarks: { type: String, default: null },
  revision: { type: Number, required: true },
  updatedAt: { type: Date, required: true },
});

// One plan per user per day; also serves "my plans between two dates".
dailyPlanSchema.index({ userId: 1, planDate: 1 }, { unique: true });

export const DailyPlanModel = model<DailyPlanDoc>('DailyPlan', dailyPlanSchema);
