import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { ORDER_STATUSES, type OrderStatus } from '../domain/order.entity.js';

interface OrderItemDoc {
  productId: Types.ObjectId;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
  suppliedQty?: number | null;
  freeQty?: number;
  discount?: DiscountDoc | null;
  netAmountPaise?: number;
  suppliedNetPaise?: number | null;
  hsn?: string | null;
  batchNo?: string | null;
  expiry?: string | null;
}
interface DiscountDoc {
  type: 'PERCENT' | 'FIXED';
  percent?: number;
  amountPaise?: number;
}
interface InvoiceDoc {
  taxablePaise: number;
  lines: Array<{ gstPercent: number; gstPaise: number }>;
  gstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}
export interface OrderDoc {
  userId: Types.ObjectId;
  /** Exactly one of the two is set. */
  chemistId?: Types.ObjectId;
  distributorId?: Types.ObjectId;
  orderDate: string;
  status: OrderStatus;
  totalAmountPaise: number;
  discount?: DiscountDoc | null;
  orderDiscountPaise?: number;
  suppliedAmountPaise?: number | null;
  originalItems?: OrderItemDoc[] | null;
  originalTotalAmountPaise?: number | null;
  remarks: string | null;
  items: OrderItemDoc[];
  completedBy: Types.ObjectId | null;
  completedAt: Date | null;
  invoiceNumber?: string | null;
  invoice?: InvoiceDoc | null;
  clientId: string | null;
  createdAt: Date;
  createdBy?: Types.ObjectId | null;
  editedBy?: Types.ObjectId | null;
  editedAt?: Date | null;
}

const paise = { type: Number, required: true, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } };
const discountSchema = new Schema<DiscountDoc>(
  {
    type: { type: String, required: true, enum: ['PERCENT', 'FIXED'] },
    percent: { type: Number, min: 0, max: 100 },
    amountPaise: { type: Number, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } },
  },
  { _id: false },
);
const itemSchema = new Schema<OrderItemDoc>(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
    quantity: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'Whole units only.' } },
    unitPricePaise: paise,
    amountPaise: paise,
    suppliedQty: { type: Number, default: null, min: 0, validate: { validator: (v: number | null) => v === null || Number.isInteger(v), message: 'Whole units only.' } },
    freeQty: { type: Number, default: 0, min: 0, validate: { validator: Number.isInteger, message: 'Whole units only.' } },
    discount: { type: discountSchema, default: null },
    netAmountPaise: { type: Number, min: 0 },
    suppliedNetPaise: { type: Number, default: null, min: 0 },
    // Set when the order is marked Done; absent on older orders, read as null.
    hsn: { type: String, default: null },
    batchNo: { type: String, default: null },
    expiry: { type: String, default: null },
  },
  { _id: false },
);
const invoiceSchema = new Schema<InvoiceDoc>(
  {
    taxablePaise: paise,
    lines: { type: [new Schema({ gstPercent: { type: Number, required: true, min: 0 }, gstPaise: paise }, { _id: false })], default: [] },
    gstPaise: paise,
    roundOffPaise: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'Must be a whole number of paise.' } },
    totalPaise: paise,
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
  discount: { type: discountSchema, default: null },
  orderDiscountPaise: { type: Number, default: 0, min: 0 },
  suppliedAmountPaise: { type: Number, default: null, min: 0 },
  originalItems: { type: [itemSchema], default: undefined },
  originalTotalAmountPaise: { type: Number, default: null, min: 0 },
  remarks: { type: String, default: null },
  items: { type: [itemSchema], required: true, validate: { validator: (v: unknown[]) => v.length > 0, message: 'An order needs at least one line.' } },
  completedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  completedAt: { type: Date, default: null },
  invoiceNumber: { type: String, default: null, trim: true, maxlength: 30 },
  invoice: { type: invoiceSchema, default: null },
  clientId: { type: String, default: null },
  createdAt: { type: Date, required: true },
  createdBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  editedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  editedAt: { type: Date, default: null },
});
orderSchema.pre('validate', function () {
  if (Boolean(this.chemistId) === Boolean(this.distributorId)) this.invalidate('chemistId', 'Exactly one of chemistId and distributorId is required.');
  if (this.items.some((i) => i.suppliedQty != null && i.suppliedQty > i.quantity)) this.invalidate('items', 'Supplied cannot be more than ordered.');
  if (this.items.reduce((n, i) => n + (i.netAmountPaise ?? i.amountPaise), 0) !== this.totalAmountPaise) this.invalidate('totalAmountPaise', 'The total must equal the sum of the lines after discounts.');
});
orderSchema.index({ userId: 1, orderDate: -1 });
orderSchema.index({ chemistId: 1, orderDate: -1 }, { partialFilterExpression: { chemistId: { $type: 'objectId' } } });
orderSchema.index({ distributorId: 1, orderDate: -1 }, { partialFilterExpression: { distributorId: { $type: 'objectId' } } });
// One order per phone record; orders placed online have no client id and are left out.
orderSchema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
// An invoice number is used once; orders without one are left out.
orderSchema.index({ invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } });
export const OrderModel = model<OrderDoc>('Order', orderSchema);
