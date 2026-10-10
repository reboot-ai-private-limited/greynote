import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { CAMPAIGN_STATUSES, VISUAL_CATEGORIES, VISUAL_STATUSES, type CampaignStatus, type VisualCategory, type VisualStatus } from '../domain/marketing.entities.js';

export interface VisualDoc {
  productId: Types.ObjectId | null;
  title: string;
  category: VisualCategory;
  fileUrl: string;
  publicId: string;
  mimeType: string;
  uploadedBy: Types.ObjectId;
  status: VisualStatus;
  createdAt: Date;
}
const visualSchema = new Schema<VisualDoc>({
  productId: { type: Schema.Types.ObjectId, default: null, ref: 'Product' },
  title: { type: String, required: true },
  category: { type: String, required: true, enum: VISUAL_CATEGORIES },
  fileUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  mimeType: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  status: { type: String, required: true, enum: VISUAL_STATUSES },
  createdAt: { type: Date, required: true },
});
visualSchema.index({ status: 1, productId: 1, createdAt: -1 });
export const VisualModel = model<VisualDoc>('Visual', visualSchema);

export interface DoctorVisualDoc {
  doctorId: Types.ObjectId;
  visualId: Types.ObjectId;
  addedBy: Types.ObjectId;
  addedAt: Date;
  removedBy: Types.ObjectId | null;
  removedAt: Date | null;
}
const doctorVisualSchema = new Schema<DoctorVisualDoc>({
  doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' },
  visualId: { type: Schema.Types.ObjectId, required: true, ref: 'Visual' },
  addedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  addedAt: { type: Date, required: true },
  removedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  removedAt: { type: Date, default: null },
});
// One row per Doctor and Visual, so two racing adds cannot double a pick.
doctorVisualSchema.index({ doctorId: 1, visualId: 1 }, { unique: true });
export const DoctorVisualModel = model<DoctorVisualDoc>('DoctorVisual', doctorVisualSchema);

export interface CampaignDoc {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
}
const campaignSchema = new Schema<CampaignDoc>({
  name: { type: String, required: true },
  // Not `required`: Mongoose treats an empty string as missing, and a campaign may have no description.
  description: { type: String, default: '' },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, required: true, enum: CAMPAIGN_STATUSES },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  createdAt: { type: Date, required: true },
});
campaignSchema.pre('validate', function () {
  if (this.endDate < this.startDate) this.invalidate('endDate', 'A campaign cannot end before it starts.');
});
campaignSchema.index({ status: 1, startDate: -1 });
export const CampaignModel = model<CampaignDoc>('Campaign', campaignSchema);

export interface TargetDoc {
  userId: Types.ObjectId;
  /** First month of the range. */
  month: string;
  /** Last month of the range (equal to `month` for one month). */
  toMonth: string;
  /** Stored as an explicit `null` when general, so the unique index treats "no product" as one value. */
  productId: Types.ObjectId | null;
  campaignId: Types.ObjectId | null;
  targetAmountPaise: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
const targetSchema = new Schema<TargetDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  toMonth: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  productId: { type: Schema.Types.ObjectId, default: null, ref: 'Product' },
  campaignId: { type: Schema.Types.ObjectId, default: null, ref: 'Campaign' },
  targetAmountPaise: { type: Number, required: true, min: 1, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
});
targetSchema.pre('validate', function () {
  if (this.toMonth < this.month) this.invalidate('toMonth', 'A target cannot end before it starts.');
});
targetSchema.index({ userId: 1, month: 1, toMonth: 1, productId: 1, campaignId: 1 }, { unique: true });
targetSchema.index({ userId: 1, toMonth: 1 });
export const TargetModel = model<TargetDoc>('Target', targetSchema);

/** History only: the typed-in monthly achievement of the Sales Dashboard before 2026-10-10. Nothing writes it any more; achievement is the secondary an employee enters. */
export interface AchievementDoc {
  userId: Types.ObjectId;
  month: string;
  achievedAmountPaise: number;
  enteredBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
const achievementSchema = new Schema<AchievementDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  achievedAmountPaise: { type: Number, required: true, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } },
  enteredBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
});
achievementSchema.index({ userId: 1, month: 1 }, { unique: true });
achievementSchema.index({ month: 1 });
export const AchievementModel = model<AchievementDoc>('Achievement', achievementSchema);
