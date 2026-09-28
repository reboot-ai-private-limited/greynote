import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from '../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { MonthlyPlanModel, type MonthlyPlanDoc } from './monthlyPlan.schema.js';
import { isDuplicateKey, toDayDoc, toPlanDay } from './planDoc.js';

function toPlan(doc: MonthlyPlanDoc & { _id: unknown }): MonthlyPlan {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    planMonth: doc.planMonth,
    entries: doc.entries.map((e) => ({ planDate: e.planDate, ...toPlanDay(e) })),
    revision: doc.revision,
    lateResubmits: doc.lateResubmits ?? 0,
    updatedAt: doc.updatedAt,
  };
}

const toEntryDocs = (entries: MonthlyPlanEntry[]) => entries.map((e) => ({ planDate: e.planDate, ...toDayDoc(e) }));

export class MongoMonthlyPlanAdapter implements MonthlyPlanRepositoryPort {
  async findById(id: string): Promise<MonthlyPlan | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await MonthlyPlanModel.findById(id).lean();
    return doc ? toPlan(doc) : null;
  }

  async findByUserAndMonth(userId: string, planMonth: string): Promise<MonthlyPlan | null> {
    const doc = await MonthlyPlanModel.findOne({ userId: new Types.ObjectId(userId), planMonth }).lean();
    return doc ? toPlan(doc) : null;
  }

  async listForUser(userId: string, fromMonth: string, toMonth: string): Promise<MonthlyPlan[]> {
    const docs = await MonthlyPlanModel.find({
      userId: new Types.ObjectId(userId),
      planMonth: { $gte: fromMonth, $lte: toMonth },
    })
      .sort({ planMonth: 1 })
      .lean();
    return docs.map(toPlan);
  }

  async save(
    userId: string,
    planMonth: string,
    entries: MonthlyPlanEntry[],
    expectedRevision: number | null,
  ): Promise<MonthlyPlan | null> {
    const body = { entries: toEntryDocs(entries), updatedAt: new Date() };
    if (expectedRevision === null) {
      try {
        const doc = await MonthlyPlanModel.create({ userId: new Types.ObjectId(userId), planMonth, ...body, revision: 1, lateResubmits: 0 });
        return toPlan(doc.toObject());
      } catch (err) {
        // Another save created the month's plan first.
        if (isDuplicateKey(err)) return null;
        throw err;
      }
    }
    const doc = await MonthlyPlanModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), planMonth, revision: expectedRevision },
      { $set: body, $inc: { revision: 1 } },
      { new: true },
    ).lean();
    return doc ? toPlan(doc) : null;
  }

  async confirmRevision(id: string, revision: number, countLateResubmit: boolean, ctx: TransactionContext): Promise<boolean> {
    const result = await MonthlyPlanModel.updateOne(
      { _id: id, revision },
      { $inc: { revision: 1, ...(countLateResubmit && { lateResubmits: 1 }) } },
      { session: ctx as ClientSession },
    );
    return result.matchedCount === 1;
  }
}
