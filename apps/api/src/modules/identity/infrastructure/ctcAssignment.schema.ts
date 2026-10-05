import { Schema, model, type Types } from 'mongoose';
import type { PayComponentKind } from '../domain/payComponent.entity.js';

export interface CtcAssignmentDocument {
  userId: Types.ObjectId;
  ctcAnnualPaise: number;
  effectiveFrom: string;
  overrides: Record<string, number>;
  lines: Array<{ code: string; name: string; kind: PayComponentKind; amountPaise: number; isOverridden: boolean }>;
  reason: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const lineSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, required: true, enum: ['EARNING', 'EMPLOYER_CONTRIBUTION'] },
    amountPaise: { type: Number, required: true },
    isOverridden: { type: Boolean, required: true },
  },
  { _id: false },
);

const ctcAssignmentSchema = new Schema<CtcAssignmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    ctcAnnualPaise: { type: Number, required: true },
    effectiveFrom: { type: String, required: true },
    overrides: { type: Schema.Types.Mixed, required: true, default: {} },
    lines: { type: [lineSchema], required: true },
    reason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

ctcAssignmentSchema.index({ userId: 1, effectiveFrom: -1, createdAt: -1 });

export const CtcAssignmentModel = model<CtcAssignmentDocument>('CtcAssignment', ctcAssignmentSchema);
