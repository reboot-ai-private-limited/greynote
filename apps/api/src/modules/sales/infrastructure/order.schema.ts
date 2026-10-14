import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { ORDER_STATUSES, type OrderStatus } from '../domain/order.entity.js';

interface OrderItemDoc {
  productId: Types.ObjectId;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
}
export interface OrderDoc {
  userId: Types.ObjectId;
  /** Exactly one of the two is set. */
  chemistId?: Types.ObjectId;
  distributorId?: Types.ObjectId;
  orderDate: string;
  status: OrderStatus;
  totalAmountPaise: number;
  remarks: string | null;
  items: OrderItemDoc[];
  completedBy: Types.ObjectId | null;
  completedAt: Date | null;
  clientId: string | null;
  createdAt: Date;
  createdBy?: Types.ObjectId | null;
  editedBy?: Types.ObjectId | null;
  editedAt?: Date | null;
}

const paise = { type: Number, required: true, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } };
const itemSchema = new Schema<OrderItemDoc>(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
    quantity: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'Whole units only.' } },
    unitPricePaise: paise,
    amountPaise: paise,
  },
  { _id: false },
);
const orderSchema = new Schema<OrderDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  chemistId: { type: Schema.Types.ObjectId, ref: 'Chemist' },
  distributorId: { type: Schema.Types.ObjectId, ref: 'Distributor' },
  orderDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, required: true, enum: ORDER_STATUSES },
  totalAmountPaise: paise,
  remarks: { type: String, default: null },
  items: { type: [itemSchema], required: true, validate: { validator: (v: unknown[]) => v.length > 0, message: 'An order needs at least one line.' } },
  completedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  completedAt: { type: Date, default: null },
  clientId: { type: String, default: null },
  createdAt: { type: Date, required: true },
  createdBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  editedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  editedAt: { type: Date, default: null },
});
orderSchema.pre('validate', function () {
  if (Boolean(this.chemistId) === Boolean(this.distributorId)) this.invalidate('chemistId', 'Exactly one of chemistId and distributorId is required.');
  if (this.items.reduce((n, i) => n + i.amountPaise, 0) !== this.totalAmountPaise) this.invalidate('totalAmountPaise', 'The total must equal the sum of the lines.');
});
orderSchema.index({ userId: 1, orderDate: -1 });
orderSchema.index({ chemistId: 1, orderDate: -1 }, { partialFilterExpression: { chemistId: { $type: 'objectId' } } });
orderSchema.index({ distributorId: 1, orderDate: -1 }, { partialFilterExpression: { distributorId: { $type: 'objectId' } } });
// One order per phone record; orders placed online have no client id and are left out.
orderSchema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
export const OrderModel = model<OrderDoc>('Order', orderSchema);
