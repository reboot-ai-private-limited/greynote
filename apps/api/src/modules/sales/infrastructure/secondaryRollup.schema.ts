import { Schema, model, type Types } from 'mongoose';
import { STOCK_STATUSES, type StockStatus } from '../domain/monthlyStock.entity.js';

export interface SecondaryRollupDoc {
  userId: Types.ObjectId;
  month: string;
  status: StockStatus;
  requestId: string | null;
  designation: { name: string | null; level: number | null };
  lines: Array<{ distributorId: Types.ObjectId; productId: Types.ObjectId; openingQty: number; primaryQty: number; issuedQty: number }>;
  sources: Array<{ recordId: string; requestId: string | null; cycle: number; status: string; decidedAt: Date | null; mrUserId: string; name: string; employeeCode: string; openingQty: number; primaryQty: number; issuedQty: number }>;
  submittedAt: Date;
  approvedAt: Date | null;
}
const schema = new Schema<SecondaryRollupDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  status: { type: String, required: true, enum: STOCK_STATUSES },
  requestId: { type: String, default: null },
  designation: { type: new Schema({ name: { type: String, default: null }, level: { type: Number, default: null } }, { _id: false }), required: true },
  lines: [
    new Schema(
      {
        distributorId: { type: Schema.Types.ObjectId, required: true, ref: 'Distributor' },
        productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
        openingQty: { type: Number, required: true },
        primaryQty: { type: Number, required: true },
        issuedQty: { type: Number, required: true },
      },
      { _id: false },
    ),
  ],
  sources: [
    new Schema(
      {
        recordId: { type: String, required: true },
        requestId: { type: String, default: null },
        cycle: { type: Number, required: true },
        status: { type: String, required: true },
        decidedAt: { type: Date, default: null },
        mrUserId: { type: String, required: true },
        name: { type: String, required: true },
        employeeCode: { type: String, required: true },
        openingQty: { type: Number, required: true },
        primaryQty: { type: Number, required: true },
        issuedQty: { type: Number, required: true },
      },
      { _id: false },
    ),
  ],
  submittedAt: { type: Date, required: true },
  approvedAt: { type: Date, default: null },
});
schema.index({ userId: 1, month: 1 }, { unique: true });
schema.index({ month: 1, status: 1 });
export const SecondaryRollupModel = model<SecondaryRollupDoc>('SecondaryRollup', schema);
