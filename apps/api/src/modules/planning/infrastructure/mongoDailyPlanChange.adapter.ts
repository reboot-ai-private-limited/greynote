import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DailyPlanChange } from '../domain/dailyPlanChange.entity.js';
import { OpenChangeExistsError, type DailyPlanChangeRepositoryPort } from '../domain/dailyPlanChange.repository.port.js';
import { DailyPlanChangeModel, type DailyPlanChangeDoc } from './dailyPlanChange.schema.js';
import { isDuplicateKey, toDayDoc, toPlanDay } from './planDoc.js';

const toChange = (doc: DailyPlanChangeDoc & { _id: unknown }): DailyPlanChange => ({
  id: String(doc._id),
  planId: String(doc.planId),
  userId: String(doc.userId),
  planDate: doc.planDate,
  previous: toPlanDay(doc.previous),
  proposed: toPlanDay(doc.proposed),
  reason: doc.reason,
  basedOnRevision: doc.basedOnRevision,
  open: doc.open,
  applied: doc.applied,
  createdAt: doc.createdAt,
});

export class MongoDailyPlanChangeAdapter implements DailyPlanChangeRepositoryPort {
  async findById(id: string): Promise<DailyPlanChange | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DailyPlanChangeModel.findById(id).lean();
    return doc ? toChange(doc) : null;
  }

  async listForPlan(planId: string): Promise<DailyPlanChange[]> {
    return (await DailyPlanChangeModel.find({ planId: new Types.ObjectId(planId) }).sort({ createdAt: -1, _id: -1 }).lean()).map(toChange);
  }

  async countApplied(planId: string): Promise<number> {
    return DailyPlanChangeModel.countDocuments({ planId: new Types.ObjectId(planId), applied: true });
  }

  async create(
    input: Omit<DailyPlanChange, 'id' | 'open' | 'applied' | 'createdAt'>,
    ctx: TransactionContext,
  ): Promise<DailyPlanChange> {
    try {
      const [doc] = await DailyPlanChangeModel.create(
        [
          {
            planId: new Types.ObjectId(input.planId),
            userId: new Types.ObjectId(input.userId),
            planDate: input.planDate,
            previous: toDayDoc(input.previous),
            proposed: toDayDoc(input.proposed),
            reason: input.reason,
            basedOnRevision: input.basedOnRevision,
            open: true,
            applied: false,
            createdAt: new Date(),
          },
        ],
        { session: ctx as ClientSession },
      );
      return toChange(doc!.toObject());
    } catch (err) {
      // The database aborts the transaction on this, so it is thrown for the use case to answer.
      if (isDuplicateKey(err)) throw new OpenChangeExistsError();
      throw err;
    }
  }

  async close(id: string, applied: boolean, ctx: TransactionContext): Promise<void> {
    await DailyPlanChangeModel.updateOne({ _id: new Types.ObjectId(id) }, { $set: { open: false, applied } }, { session: ctx as ClientSession });
  }
}
