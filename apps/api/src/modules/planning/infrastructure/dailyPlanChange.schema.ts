import { Schema, model, type Types } from 'mongoose';
import { planDaySchemaFields, type PlanDayDoc } from './planDoc.js';

export interface DailyPlanChangeDoc {
  planId: Types.ObjectId;
  userId: Types.ObjectId;
  planDate: string;
  previous: PlanDayDoc;
  proposed: PlanDayDoc;
  reason: string;
  basedOnRevision: number;
  open: boolean;
  applied: boolean;
  createdAt: Date;
}

const planDayShape = { ...planDaySchemaFields };

const dailyPlanChangeSchema = new Schema<DailyPlanChangeDoc>({
  planId: { type: Schema.Types.ObjectId, required: true, ref: 'DailyPlan' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  planDate: { type: String, required: true },
  previous: { type: new Schema(planDayShape, { _id: false }), required: true },
  proposed: { type: new Schema(planDayShape, { _id: false }), required: true },
  reason: { type: String, required: true },
  basedOnRevision: { type: Number, required: true },
  open: { type: Boolean, required: true },
  applied: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true },
});

// One waiting change per plan, enforced by the database so two simultaneous requests can't both get in.
dailyPlanChangeSchema.index({ planId: 1 }, { unique: true, partialFilterExpression: { open: true } });
dailyPlanChangeSchema.index({ planId: 1, createdAt: -1 });

export const DailyPlanChangeModel = model<DailyPlanChangeDoc>('DailyPlanChange', dailyPlanChangeSchema);
