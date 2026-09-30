import { Schema, model, type Types } from 'mongoose';

export interface MonthlyStockDoc {
  /** Exactly one of the two is set (the other is absent, so each partial unique index below covers only its own kind). */
  chemistId?: Types.ObjectId;
  distributorId?: Types.ObjectId;
  productId: Types.ObjectId;
  month: string;
  openingQty: number;
  closingQty: number;
  recordedBy: Types.ObjectId;
  recordedAt: Date;
}
const stockSchema = new Schema<MonthlyStockDoc>({
  chemistId: { type: Schema.Types.ObjectId, ref: 'Chemist' },
  distributorId: { type: Schema.Types.ObjectId, ref: 'Distributor' },
  productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  openingQty: { type: Number, required: true, min: 0 },
  closingQty: { type: Number, required: true, min: 0 },
  recordedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  recordedAt: { type: Date, required: true },
});
stockSchema.pre('validate', function () {
  if (Boolean(this.chemistId) === Boolean(this.distributorId)) this.invalidate('chemistId', 'Exactly one of chemistId and distributorId is required.');
});
stockSchema.index({ chemistId: 1, productId: 1, month: 1 }, { unique: true, partialFilterExpression: { chemistId: { $type: 'objectId' } } });
stockSchema.index({ distributorId: 1, productId: 1, month: 1 }, { unique: true, partialFilterExpression: { distributorId: { $type: 'objectId' } } });
stockSchema.index({ month: 1 });
export const MonthlyStockModel = model<MonthlyStockDoc>('MonthlyStock', stockSchema);

export interface MonthlyStockUnlockDoc {
  month: string;
  unlockedBy: Types.ObjectId;
  unlockedAt: Date;
}
const unlockSchema = new Schema<MonthlyStockUnlockDoc>({
  month: { type: String, required: true, unique: true },
  unlockedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  unlockedAt: { type: Date, required: true },
});
export const MonthlyStockUnlockModel = model<MonthlyStockUnlockDoc>('MonthlyStockUnlock', unlockSchema);
