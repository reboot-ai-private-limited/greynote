import { Schema, model, type Types } from 'mongoose';
import { HOLIDAY_SCOPES, type HolidayScope } from '../domain/holiday.entity.js';

export interface HolidayDoc {
  name: string;
  date: string;
  scope: HolidayScope;
  zoneIds: Types.ObjectId[];
  hqIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const holidaySchema = new Schema<HolidayDoc>({
  name: { type: String, required: true },
  // `YYYY-MM-DD` — a calendar day, sorts as a string.
  date: { type: String, required: true },
  scope: { type: String, required: true, enum: HOLIDAY_SCOPES },
  // Embedded instead of the ERD's HolidayZone/HolidayHQ join tables — a handful of ids per row.
  zoneIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Zone' },
  hqIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Hq' },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  createdAt: { type: Date, required: true },
});

holidaySchema.index({ date: 1 });

export const HolidayModel = model<HolidayDoc>('Holiday', holidaySchema);
