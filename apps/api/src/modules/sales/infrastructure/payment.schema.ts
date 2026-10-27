import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { PAYMENT_MODES, PAYMENT_STATUSES, type PaymentMode, type PaymentStatus } from '../domain/payment.entity.js';

export interface PaymentDoc {
  distributorId: Types.ObjectId;
  paymentDate: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  allocations?: Array<{ orderId: Types.ObjectId; amountPaise: number }>;
  status: PaymentStatus;
  recordedBy: Types.ObjectId;
  createdAt: Date;
  cancelledBy: Types.ObjectId | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

const paymentSchema = new Schema<PaymentDoc>({
  distributorId: { type: Schema.Types.ObjectId, required: true, ref: 'Distributor' },
  paymentDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  amountPaise: { type: Number, required: true, min: 1, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } },
  mode: { type: String, required: true, enum: PAYMENT_MODES },
  reference: { type: String, default: null },
  note: { type: String, default: null },
  allocations: {
    type: [new Schema({ orderId: { type: Schema.Types.ObjectId, required: true, ref: 'Order' }, amountPaise: { type: Number, required: true, min: 1, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } } }, { _id: false })],
    default: [],
  },
  status: { type: String, required: true, enum: PAYMENT_STATUSES },
  recordedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  createdAt: { type: Date, required: true },
  cancelledBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: null },
});
paymentSchema.index({ distributorId: 1, paymentDate: -1 });
paymentSchema.index({ 'allocations.orderId': 1 });
export const PaymentModel = model<PaymentDoc>('DistributorPayment', paymentSchema);
