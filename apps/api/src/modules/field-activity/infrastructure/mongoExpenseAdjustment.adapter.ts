import { Types, type ClientSession } from 'mongoose';
import type { ExpenseAdjustment, ExpenseAdjustmentRepositoryPort } from '../domain/expenseAdjustment.entity.js';
import { ExpenseAdjustmentModel, type ExpenseAdjustmentDoc } from './expenseAdjustment.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toAdjustment = (d: ExpenseAdjustmentDoc & { _id: unknown }): ExpenseAdjustment => ({
  id: String(d._id),
  userId: String(d.userId),
  month: d.month,
  reportDate: d.reportDate,
  expenseId: String(d.expenseId),
  type: d.type,
  kind: d.kind,
  beforePaise: d.beforePaise,
  afterPaise: d.afterPaise,
  reason: d.reason,
  by: String(d.by),
  byRole: d.byRole,
  at: d.at,
});

export class MongoExpenseAdjustmentAdapter implements ExpenseAdjustmentRepositoryPort {
  async create(input: Omit<ExpenseAdjustment, 'id'>, ctx: unknown): Promise<ExpenseAdjustment> {
    const [doc] = await ExpenseAdjustmentModel.create([{ ...input, userId: oid(input.userId), expenseId: oid(input.expenseId), by: oid(input.by) }], { session: ctx as ClientSession });
    return toAdjustment(doc!.toObject());
  }
  async listForUserMonth(userId: string, month: string): Promise<ExpenseAdjustment[]> {
    return (await ExpenseAdjustmentModel.find({ userId: oid(userId), month }).sort({ at: 1, _id: 1 }).lean()).map(toAdjustment);
  }
}
