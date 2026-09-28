import { Schema, Types } from 'mongoose';
import { WORKING_TYPES } from '../domain/plan.js';
import type { PlanDay, WorkingType } from '../domain/plan.js';

/** A planned day as stored — shared by `DailyPlan` and embedded `MonthlyPlan` entries. */
export interface PlanDayDoc {
  workingType: WorkingType;
  workWith: Types.ObjectId[];
  routeIds: Types.ObjectId[];
  remarks: string | null;
}

/** The fields of a planned day, spread into `DailyPlan`'s schema and a Monthly entry's. */
export const planDaySchemaFields = {
  workingType: { type: String, required: true, enum: [...WORKING_TYPES] },
  workWith: { type: [Schema.Types.ObjectId], default: [], ref: 'User' },
  routeIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Route' },
  remarks: { type: String, default: null },
};

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
