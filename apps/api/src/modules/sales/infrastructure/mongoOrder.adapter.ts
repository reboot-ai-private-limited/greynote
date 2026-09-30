import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Order } from '../domain/order.entity.js';
import type { OrderAmountFilter, OrderFilter, OrderRepositoryPort } from '../domain/order.repository.port.js';
import { OrderModel, type OrderDoc } from './order.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toOrder = (d: OrderDoc & { _id: unknown }): Order => ({
  id: String(d._id),
  userId: String(d.userId),
  outlet: d.chemistId ? { type: 'CHEMIST', id: String(d.chemistId) } : { type: 'DISTRIBUTOR', id: String(d.distributorId) },
  orderDate: d.orderDate,
  status: d.status,
  totalAmountPaise: d.totalAmountPaise,
  remarks: d.remarks,
  items: d.items.map((i) => ({ productId: String(i.productId), quantity: i.quantity, unitPricePaise: i.unitPricePaise, amountPaise: i.amountPaise })),
  completedBy: d.completedBy ? String(d.completedBy) : null,
  completedAt: d.completedAt,
  clientId: d.clientId,
  createdAt: d.createdAt,
});

export class MongoOrderAdapter implements OrderRepositoryPort {
  async create(input: Omit<Order, 'id'>, ctx?: TransactionContext): Promise<Order> {
    const { outlet, ...rest } = input;
    const doc = {
      ...rest,
      userId: oid(input.userId),
      ...(outlet.type === 'CHEMIST' ? { chemistId: oid(outlet.id) } : { distributorId: oid(outlet.id) }),
      items: input.items.map((i) => ({ ...i, productId: oid(i.productId) })),
    };
    const [created] = await OrderModel.create([doc], ctx ? { session: ctx as ClientSession } : {});
    return toOrder(created!.toObject());
  }

  async sumAmount(filter: OrderAmountFilter): Promise<number> {
    if (filter.userIds.length === 0) return 0;
    const match = { userId: { $in: filter.userIds.map(oid) }, status: { $ne: 'CANCELLED' }, orderDate: { $gte: filter.from, $lte: filter.to } };
    const pipeline = filter.productId
      ? [{ $match: match }, { $unwind: '$items' }, { $match: { 'items.productId': oid(filter.productId) } }, { $group: { _id: null, total: { $sum: '$items.amountPaise' } } }]
      : [{ $match: match }, { $group: { _id: null, total: { $sum: '$totalAmountPaise' } } }];
    const [row] = await OrderModel.aggregate<{ total: number }>(pipeline);
    return row?.total ?? 0;
  }

  async findById(id: string): Promise<Order | null> {
    const doc = await OrderModel.findById(id).lean();
    return doc ? toOrder(doc) : null;
  }

  async list(filter: OrderFilter, limit: number): Promise<Order[]> {
    const q: FilterQuery<OrderDoc> = {};
    if (filter.userIds) q.userId = { $in: filter.userIds.map(oid) };
    if (filter.status) q.status = filter.status;
    if (filter.from || filter.to) q.orderDate = { ...(filter.from && { $gte: filter.from }), ...(filter.to && { $lte: filter.to }) };
    if (filter.outlet) q[filter.outlet.type === 'CHEMIST' ? 'chemistId' : 'distributorId'] = oid(filter.outlet.id);
    return (await OrderModel.find(q).sort({ orderDate: -1, _id: -1 }).limit(limit).lean()).map(toOrder);
  }

  async transition(id: string, to: 'DONE' | 'CANCELLED', by: string, at: Date): Promise<boolean> {
    const res = await OrderModel.updateOne({ _id: oid(id), status: 'PLACED' }, { $set: { status: to, completedBy: oid(by), completedAt: at } });
    return res.modifiedCount === 1;
  }
}
