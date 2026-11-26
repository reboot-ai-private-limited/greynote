import { Schema, Types } from 'mongoose';
import { DAY_KINDS, WORKING_TYPES } from '../domain/plan.js';
import type { DayKind, PlanDay, WorkingType } from '../domain/plan.js';

/** A planned day as stored — shared by `DailyPlan` and embedded `MonthlyPlan` entries. */
export interface PlanDayDoc {
  workingType: WorkingType;
  dayKind?: DayKind;
  workWith: Types.ObjectId[];
  routeIds: Types.ObjectId[];
  fromPlaceId?: Types.ObjectId | null;
  toPlaceId?: Types.ObjectId | null;
  remarks: string | null;
}

/** The fields of a planned day, spread into `DailyPlan`'s schema and a Monthly entry's. */
export const planDaySchemaFields = {
  workingType: { type: String, required: true, enum: [...WORKING_TYPES] },
  dayKind: { type: String, enum: [...DAY_KINDS], default: 'NORMAL' },
  workWith: { type: [Schema.Types.ObjectId], default: [], ref: 'User' },
  routeIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Route' },
  fromPlaceId: { type: Schema.Types.ObjectId, default: null, ref: 'Place' },
  toPlaceId: { type: Schema.Types.ObjectId, default: null, ref: 'Place' },
  remarks: { type: String, default: null },
};

export const toPlanDay = (doc: PlanDayDoc): PlanDay => ({
  workingType: doc.workingType,
  dayKind: doc.dayKind ?? 'NORMAL',
  workWith: doc.workWith.map(String),
  routeIds: doc.routeIds.map(String),
  fromPlaceId: doc.fromPlaceId ? String(doc.fromPlaceId) : null,
  toPlaceId: doc.toPlaceId ? String(doc.toPlaceId) : null,
  remarks: doc.remarks,
});

export const toDayDoc = (day: PlanDay): PlanDayDoc => ({
  workingType: day.workingType,
  dayKind: day.dayKind,
  workWith: day.workWith.map((id) => new Types.ObjectId(id)),
  routeIds: day.routeIds.map((id) => new Types.ObjectId(id)),
  fromPlaceId: day.fromPlaceId ? new Types.ObjectId(day.fromPlaceId) : null,
  toPlaceId: day.toPlaceId ? new Types.ObjectId(day.toPlaceId) : null,
  remarks: day.remarks,
});

export const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;
