import { Schema, model, type Types } from 'mongoose';

interface RevisionDoc {
  by: Types.ObjectId;
  at: Date;
  openingQty: number;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
}
export interface StockStatementDoc {
  distributorId: Types.ObjectId;
  productId: Types.ObjectId;
  month: string;
  openingQty: number;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
  enteredBy: Types.ObjectId;
  enteredAt: Date;
  updatedBy: Types.ObjectId;
  updatedAt: Date;
  history: RevisionDoc[];
}

const revisionSchema = new Schema<RevisionDoc>(
  {
    by: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    at: { type: Date, required: true },
    openingQty: { type: Number, required: true },
    secondaryQty: { type: Number, default: null },
    adjustmentQty: { type: Number, required: true },
    adjustmentReason: { type: String, default: null },
  },
  { _id: false },
);
const statementSchema = new Schema<StockStatementDoc>({
  distributorId: { type: Schema.Types.ObjectId, required: true, ref: 'Distributor' },
  productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  openingQty: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'Whole units only.' } },
  secondaryQty: { type: Number, default: null, min: 0, validate: { validator: (v: number | null) => v === null || Number.isInteger(v), message: 'Whole units only.' } },
  adjustmentQty: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'Whole units only.' } },
  adjustmentReason: { type: String, default: null },
  enteredBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  enteredAt: { type: Date, required: true },
  updatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  updatedAt: { type: Date, required: true },
  history: { type: [revisionSchema], default: [] },
});
statementSchema.index({ distributorId: 1, productId: 1, month: 1 }, { unique: true });
statementSchema.index({ month: 1 });
export const StockStatementModel = model<StockStatementDoc>('StockStatement', statementSchema);
