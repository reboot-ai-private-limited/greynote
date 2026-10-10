import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Order } from '../domain/order.entity.js';
import { addDays, dayStartInstant, DEFAULT_DAY_START, parseCalendarDate, parseTimeOfDay } from '@/shared/time/businessTime.js';
import type { DistributorOrderSum, DistributorOrderSumFilter, OrderAmountFilter, OrderFilter, OrderRepositoryPort, UserOrderSum, UserOrderSumFilter } from '../domain/order.repository.port.js';
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

/** `field` moved back by the day start, so the small hours before it fall into the previous day (and month) when formatted. */
function shiftedBy(dayStart: string, field: string) {
  const { hour, minute } = parseTimeOfDay(dayStart);
  const minutes = hour * 60 + minute;
  return minutes === 0 ? field : { $dateSubtract: { startDate: field, unit: 'minute', amount: minutes } };
}

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

  async sumDistributorOrders(f: DistributorOrderSumFilter): Promise<DistributorOrderSum[]> {
    const dayStart = f.dayStart ?? DEFAULT_DAY_START;
    const start = dayStartInstant(parseCalendarDate(f.from), dayStart, f.timeZone);
    const end = dayStartInstant(parseCalendarDate(addDays(f.to, 1)), dayStart, f.timeZone);
    const outlet = { distributorId: f.distributorId ? oid(f.distributorId) : { $type: 'objectId' } };
    const lines = [{ $unwind: '$items' }, ...(f.productId ? [{ $match: { 'items.productId': oid(f.productId) } }] : [])];
    const group = (month: unknown) => ({ $group: { _id: { m: month, d: '$distributorId', p: '$items.productId' }, quantity: { $sum: '$items.quantity' }, amountPaise: { $sum: '$items.amountPaise' } } });
    type Row = { _id: { m: string; d: Types.ObjectId; p: Types.ObjectId }; quantity: number; amountPaise: number };
    const [done, placed] = await Promise.all([
      OrderModel.aggregate<Row>([{ $match: { ...outlet, status: 'DONE', completedAt: { $gte: start, $lt: end } } }, ...lines, group({ $dateToString: { format: '%Y-%m', date: shiftedBy(dayStart, '$completedAt'), timezone: f.timeZone } })]),
      OrderModel.aggregate<Row>([{ $match: { ...outlet, status: 'PLACED', orderDate: { $gte: f.from, $lte: f.to } } }, ...lines, group({ $substrBytes: ['$orderDate', 0, 7] })]),
    ]);
    const rows = (status: 'DONE' | 'PLACED') => (r: Row): DistributorOrderSum => ({ month: r._id.m, distributorId: String(r._id.d), productId: String(r._id.p), status, quantity: r.quantity, amountPaise: r.amountPaise });
    return [...done.map(rows('DONE')), ...placed.map(rows('PLACED'))];
  }

  async sumUserOrders(f: UserOrderSumFilter): Promise<UserOrderSum[]> {
    const dayStart = f.dayStart ?? DEFAULT_DAY_START;
    const start = dayStartInstant(parseCalendarDate(f.from), dayStart, f.timeZone);
    const end = dayStartInstant(parseCalendarDate(addDays(f.to, 1)), dayStart, f.timeZone);
    if (f.userIds && f.userIds.length === 0) return [];
    const match = { distributorId: { $type: 'objectId' }, status: 'DONE', completedAt: { $gte: start, $lt: end }, ...(f.userIds && { userId: { $in: f.userIds.map(oid) } }) };
    type Row = { _id: { m: string; u: Types.ObjectId; p: Types.ObjectId }; quantity: number; amountPaise: number };
    const rows = await OrderModel.aggregate<Row>([
      { $match: match },
      { $unwind: '$items' },
      ...(f.productId ? [{ $match: { 'items.productId': oid(f.productId) } }] : []),
      { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: shiftedBy(dayStart, '$completedAt'), timezone: f.timeZone } }, u: '$userId', p: '$items.productId' }, quantity: { $sum: '$items.quantity' }, amountPaise: { $sum: '$items.amountPaise' } } },
    ]);
    return rows.map((r) => ({ month: r._id.m, userId: String(r._id.u), productId: String(r._id.p), quantity: r.quantity, amountPaise: r.amountPaise }));
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
