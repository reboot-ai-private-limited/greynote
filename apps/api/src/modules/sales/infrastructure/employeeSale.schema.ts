import { Schema, model, type Types } from 'mongoose';

interface RevisionDoc {
  by: Types.ObjectId;
  at: Date;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
}
export interface EmployeeSaleDoc {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  month: string;
  secondaryQty: number | null;
  secondaryAmountPaise?: number | null;
  /** Absent on rows written before approval existed: those read as APPROVED. */
  secondaryStatus?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  adjustmentQty: number;
  adjustmentReason: string | null;
  updatedBy: Types.ObjectId;
  updatedAt: Date;
  history: RevisionDoc[];
}

const whole = { validator: (v: number | null) => v === null || Number.isInteger(v), message: 'Whole units only.' };
const revisionSchema = new Schema<RevisionDoc>(
  {
    by: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    at: { type: Date, required: true },
    secondaryQty: { type: Number, default: null },
    adjustmentQty: { type: Number, required: true },
    adjustmentReason: { type: String, default: null },
  },
  { _id: false },
);
const employeeSaleSchema = new Schema<EmployeeSaleDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  secondaryQty: { type: Number, default: null, min: 0, validate: whole },
  secondaryAmountPaise: { type: Number, default: null, min: 0 },
  secondaryStatus: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] },
  adjustmentQty: { type: Number, required: true, default: 0, validate: whole },
  adjustmentReason: { type: String, default: null },
  updatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  updatedAt: { type: Date, required: true },
  history: { type: [revisionSchema], default: [] },
});
employeeSaleSchema.index({ userId: 1, productId: 1, month: 1 }, { unique: true });
employeeSaleSchema.index({ month: 1 });
export const EmployeeSaleModel = model<EmployeeSaleDoc>('EmployeeSale', employeeSaleSchema);
