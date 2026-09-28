import { Types } from 'mongoose';
import type { PlanDay, WorkingType } from '../domain/plan.js';

/** A planned day as stored — shared by `DailyPlan` and embedded `MonthlyPlan` entries. */
export interface PlanDayDoc {
  workingType: WorkingType;
  workWith: Types.ObjectId[];
  routeIds: Types.ObjectId[];
  remarks: string | null;
}

export const toPlanDay = (doc: PlanDayDoc): PlanDay => ({
  workingType: doc.workingType,
  workWith: doc.workWith.map(String),
  routeIds: doc.routeIds.map(String),
  remarks: doc.remarks,
});

export const toDayDoc = (day: PlanDay): PlanDayDoc => ({
  workingType: day.workingType,
  workWith: day.workWith.map((id) => new Types.ObjectId(id)),
  routeIds: day.routeIds.map((id) => new Types.ObjectId(id)),
  remarks: day.remarks,
});

export const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;
