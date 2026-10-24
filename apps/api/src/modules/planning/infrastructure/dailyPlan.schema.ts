import { Schema, model, type Types } from 'mongoose';
import { PLAN_SOURCES, type PlanSource } from '../domain/plan.js';
import { planDaySchemaFields, type PlanDayDoc } from './planDoc.js';

export interface PlanAmendmentDoc {
  by: Types.ObjectId;
  at: Date;
  reason: string;
  previous: PlanDayDoc;
}

const amendmentSchema = new Schema<PlanAmendmentDoc>(
  { by: { type: Schema.Types.ObjectId, required: true, ref: 'User' }, at: { type: Date, required: true }, reason: { type: String, default: '' }, previous: { type: new Schema(planDaySchemaFields, { _id: false }), required: true } },
  { _id: false },
);

export interface DailyPlanDoc extends PlanDayDoc {
  userId: Types.ObjectId;
  planDate: string;
  source?: PlanSource;
  plannedFrom?: PlanDayDoc | null;
  doctors?: Array<{ doctorId: Types.ObjectId; carriedFrom: string | null }>;
  amendments?: PlanAmendmentDoc[];
  revision: number;
  lateResubmits: number;
  updatedAt: Date;
}

const dailyPlanSchema = new Schema<DailyPlanDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  // A calendar day as `YYYY-MM-DD` — sorts correctly as a string, and isn't an instant.
  planDate: { type: String, required: true },
  ...planDaySchemaFields,
  // Absent on plans from before inheritance: read as MANUAL.
  source: { type: String, enum: [...PLAN_SOURCES], default: 'MANUAL' },
  // The Monthly Plan's version of a day the employee changed; absent otherwise.
  plannedFrom: { type: new Schema(planDaySchemaFields, { _id: false }), default: null },
  amendments: { type: [amendmentSchema], default: [] },
  // Absent on plans from before doctor lists: read as none.
  doctors: { type: [new Schema({ doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' }, carriedFrom: { type: String, default: null } }, { _id: false })], default: [] },
  revision: { type: Number, required: true },
  lateResubmits: { type: Number, default: 0 },
  updatedAt: { type: Date, required: true },
});

// One plan per user per day; also serves "my plans between two dates".
dailyPlanSchema.index({ userId: 1, planDate: 1 }, { unique: true });

export const DailyPlanModel = model<DailyPlanDoc>('DailyPlan', dailyPlanSchema);
