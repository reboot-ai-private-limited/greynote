import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveBalance } from '../domain/leaveBalance.entity.js';
import type { BalanceKey, LeaveBalanceRepositoryPort } from '../domain/leaveBalance.repository.port.js';
import { LeaveBalanceModel, type LeaveBalanceDoc } from './leaveBalance.schema.js';

const toBalance = (doc: LeaveBalanceDoc & { _id: unknown }): LeaveBalance => ({
  id: String(doc._id),
  userId: String(doc.userId),
  leaveTypeId: String(doc.leaveTypeId),
  year: doc.year,
  allocatedDays: doc.allocatedDays,
  usedDays: doc.usedDays,
  pendingDays: doc.pendingDays,
  adjustedBy: doc.adjustedBy === null ? null : String(doc.adjustedBy),
  adjustedAt: doc.adjustedAt,
  adjustReason: doc.adjustReason,
});

const filterOf = (key: BalanceKey) => ({
  userId: new Types.ObjectId(key.userId),
  leaveTypeId: new Types.ObjectId(key.leaveTypeId),
  year: key.year,
});
const session = (ctx: TransactionContext) => ({ session: ctx as ClientSession });

export class MongoLeaveBalanceAdapter implements LeaveBalanceRepositoryPort {
  async listForUser(userId: string, year: number): Promise<LeaveBalance[]> {
    return (await LeaveBalanceModel.find({ userId: new Types.ObjectId(userId), year }).lean()).map(toBalance);
  }

  async find(key: BalanceKey): Promise<LeaveBalance | null> {
    const doc = await LeaveBalanceModel.findOne(filterOf(key)).lean();
    return doc ? toBalance(doc) : null;
  }

  async insertMissing(rows: Array<BalanceKey & { allocatedDays: number }>): Promise<void> {
    if (rows.length === 0) return;
    await LeaveBalanceModel.bulkWrite(
      rows.map((r) => ({
        updateOne: {
          filter: filterOf(r),
          update: {
            $setOnInsert: {
              ...filterOf(r),
              allocatedDays: r.allocatedDays,
              usedDays: 0,
              pendingDays: 0,
              adjustedBy: null,
              adjustedAt: null,
              adjustReason: null,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    ).catch((err: unknown) => {
      // Two first-time reads racing: the other one inserted the same row — which is the goal.
      if ((err as { code?: number }).code !== 11000) throw err;
    });
  }

  async setAllocated(key: BalanceKey, allocatedDays: number, by: string, reason: string): Promise<LeaveBalance | null> {
    const doc = await LeaveBalanceModel.findOneAndUpdate(
      { ...filterOf(key), $expr: { $gte: [allocatedDays, { $add: ['$usedDays', '$pendingDays'] }] } },
      { $set: { allocatedDays, adjustedBy: new Types.ObjectId(by), adjustedAt: new Date(), adjustReason: reason } },
      { new: true },
    ).lean();
    return doc ? toBalance(doc) : null;
  }

  async existsForLeaveType(leaveTypeId: string): Promise<boolean> {
    return (await LeaveBalanceModel.exists({ leaveTypeId: new Types.ObjectId(leaveTypeId) })) !== null;
  }

  async reserve(key: BalanceKey, days: number, ctx: TransactionContext): Promise<boolean> {
    const result = await LeaveBalanceModel.updateOne(
      {
        ...filterOf(key),
        $expr: { $gte: [{ $subtract: ['$allocatedDays', { $add: ['$usedDays', '$pendingDays'] }] }, days] },
      },
      { $inc: { pendingDays: days } },
      session(ctx),
    );
    return result.matchedCount === 1;
  }

  async release(key: BalanceKey, days: number, ctx: TransactionContext): Promise<void> {
    await this.apply(key, { pendingDays: -days }, { pendingDays: days }, ctx);
  }

  async consume(key: BalanceKey, days: number, ctx: TransactionContext): Promise<void> {
    await this.apply(key, { pendingDays: -days, usedDays: days }, { pendingDays: days }, ctx);
  }

  async giveBack(key: BalanceKey, days: number, ctx: TransactionContext): Promise<void> {
    await this.apply(key, { usedDays: -days }, { usedDays: days }, ctx);
  }

  /**
   * A ledger move on a row that must exist and hold at least what it's about to give up — a
   * missing row, or one that would go negative, is a broken invariant, not input. Throwing rolls
   * back the approval decision that caused it.
   */
  private async apply(
    key: BalanceKey,
    inc: Record<string, number>,
    atLeast: Partial<Record<'pendingDays' | 'usedDays', number>>,
    ctx: TransactionContext,
  ): Promise<void> {
    const covered = Object.entries(atLeast).map(([field, days]) => ({ $gte: [`$${field}`, days] }));
    const result = await LeaveBalanceModel.updateOne(
      { ...filterOf(key), $expr: { $and: covered } },
      { $inc: inc },
      session(ctx),
    );
    if (result.matchedCount === 1) return;
    const exists = (await LeaveBalanceModel.exists({ ...filterOf(key) }).session(ctx as ClientSession)) !== null;
    throw AppError.internal('INTERNAL', { reason: exists ? 'LEAVE_BALANCE_DRIFT' : 'LEAVE_BALANCE_MISSING', ...key });
  }
}
