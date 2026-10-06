import { Schema, model, type Types } from 'mongoose';
import { PROMOTION_STATUSES, type PromotionStatus } from '../domain/promotion.entity.js';

export interface PromotionDocument {
  userId: Types.ObjectId;
  effectiveFrom: string;
  status: PromotionStatus;
  fromDesignationId: Types.ObjectId | null;
  toDesignationId: Types.ObjectId | null;
  fromPayBandId: Types.ObjectId | null;
  toPayBandId: Types.ObjectId | null;
  fromManagerId: Types.ObjectId | null;
  toManagerId: Types.ObjectId | null;
  ctc: { ctcAnnualPaise: number; overrides: Record<string, number> } | null;
  teamMoves: Array<{ userId: Types.ObjectId; toManagerId: Types.ObjectId }>;
  reason: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  ctcAssignmentId: Types.ObjectId | null;
  appliedAt: Date | null;
  cancelledAt: Date | null;
}

const ref = (to: string) => ({ type: Schema.Types.ObjectId, default: null, ref: to });

const promotionSchema = new Schema<PromotionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    effectiveFrom: { type: String, required: true },
    status: { type: String, required: true, enum: PROMOTION_STATUSES, default: 'SCHEDULED' },
    fromDesignationId: ref('Designation'),
    toDesignationId: ref('Designation'),
    fromPayBandId: ref('PayBand'),
    toPayBandId: ref('PayBand'),
    fromManagerId: ref('User'),
    toManagerId: ref('User'),
    ctc: {
      type: new Schema({ ctcAnnualPaise: { type: Number, required: true }, overrides: { type: Schema.Types.Mixed, required: true, default: {} } }, { _id: false, minimize: false }),
      default: null,
    },
    teamMoves: {
      type: [new Schema({ userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' }, toManagerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' } }, { _id: false })],
      default: [],
    },
    reason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    ctcAssignmentId: ref('CtcAssignment'),
    appliedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

promotionSchema.index({ userId: 1, createdAt: -1 });
// The run that applies due promotions, and the "one scheduled per employee" check.
promotionSchema.index({ status: 1, effectiveFrom: 1 });
// Two clicks, or two admins, cannot both schedule one employee: the database refuses the second.
promotionSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'SCHEDULED' } });

export const PromotionModel = model<PromotionDocument>('Promotion', promotionSchema);
