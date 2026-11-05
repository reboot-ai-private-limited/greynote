import { Schema, model, type Types } from 'mongoose';
import { STOCK_STATUSES, type StockStatus } from '../domain/monthlyStock.entity.js';

export interface SecondaryStockLineDoc {
  userId: Types.ObjectId;
  distributorId: Types.ObjectId;
  productId: Types.ObjectId;
  month: string;
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
  status: StockStatus;
  updatedAt: Date;
  managerEdit?: { by: Types.ObjectId; at: Date; reason: string; original: { openingQty: number; primaryQty: number; issuedQty: number } } | undefined;
}
const schema = new Schema<SecondaryStockLineDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  distributorId: { type: Schema.Types.ObjectId, required: true, ref: 'Distributor' },
  productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  openingQty: { type: Number, required: true, min: 0 },
  primaryQty: { type: Number, required: true, min: 0 },
  issuedQty: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: STOCK_STATUSES },
  updatedAt: { type: Date, required: true },
  managerEdit: {
    type: new Schema(
      {
        by: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
        at: { type: Date, required: true },
        reason: { type: String, required: true },
        original: { type: new Schema({ openingQty: Number, primaryQty: Number, issuedQty: Number }, { _id: false }), required: true },
      },
      { _id: false },
    ),
    required: false,
  },
});
schema.index({ userId: 1, distributorId: 1, productId: 1, month: 1 }, { unique: true });
schema.index({ month: 1, status: 1 });
export const SecondaryStockLineModel = model<SecondaryStockLineDoc>('SecondaryStockLine', schema);
