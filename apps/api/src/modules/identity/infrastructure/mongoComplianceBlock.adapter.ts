import { Types, type ClientSession } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { ComplianceBlockEvent } from '../domain/complianceBlock.entity.js';
import { OpenBlockExistsError, type BlockClearing, type ComplianceBlockRepositoryPort } from '../domain/complianceBlock.repository.port.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { ComplianceBlockModel, type ComplianceBlockDoc } from './complianceBlock.schema.js';

function toComplianceBlockEvent(doc: ComplianceBlockDoc & { _id: unknown }): ComplianceBlockEvent {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    reason: doc.reason,
    blockedAt: doc.blockedAt,
    unblockedBy: doc.unblockedBy ? String(doc.unblockedBy) : null,
    unblockedAt: doc.unblockedAt,
    unblockedByRole: doc.unblockedByRole ?? null,
    unblockReason: doc.unblockReason ?? null,
  };
}

export class MongoComplianceBlockAdapter implements ComplianceBlockRepositoryPort {
  async findOpenByUserId(userId: string): Promise<ComplianceBlockEvent | null> {
    const doc = await ComplianceBlockModel.findOne({
      userId: new Types.ObjectId(userId),
      unblockedAt: null,
    }).lean();
    return doc ? toComplianceBlockEvent(doc) : null;
  }

  async findLastClearedAt(userId: string): Promise<Date | null> {
    const doc = await ComplianceBlockModel.findOne({ userId: new Types.ObjectId(userId), unblockedAt: { $ne: null } }).sort({ unblockedAt: -1 }).lean();
    return doc?.unblockedAt ?? null;
  }

  async create(input: Omit<ComplianceBlockEvent, 'id'>, ctx?: TransactionContext): Promise<ComplianceBlockEvent> {
    try {
      const docs = await ComplianceBlockModel.create(
        [
          {
            userId: new Types.ObjectId(input.userId),
            reason: input.reason,
            blockedAt: input.blockedAt,
            unblockedBy: input.unblockedBy ? new Types.ObjectId(input.unblockedBy) : null,
            unblockedAt: input.unblockedAt,
            unblockedByRole: input.unblockedByRole,
            unblockReason: input.unblockReason,
          },
        ],
        { ...(ctx ? { session: ctx as ClientSession } : {}) },
      );
      const doc = docs[0];
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'COMPLIANCE_BLOCK_CREATE_RETURNED_EMPTY' });
      return toComplianceBlockEvent(doc);
    } catch (err) {
      // The database aborts the transaction on this, so it is thrown for the use case to answer.
      if ((err as { code?: number }).code === 11000) throw new OpenBlockExistsError();
      throw err;
    }
  }

  async close(id: string, clearing: BlockClearing, ctx?: TransactionContext): Promise<void> {
    await ComplianceBlockModel.updateOne(
      { _id: id },
      {
        unblockedBy: new Types.ObjectId(clearing.unblockedBy),
        unblockedByRole: clearing.unblockedByRole,
        unblockReason: clearing.unblockReason,
        unblockedAt: clearing.unblockedAt,
      },
      { ...(ctx ? { session: ctx as ClientSession } : {}) },
    );
  }

  async listByUserId(userId: string): Promise<ComplianceBlockEvent[]> {
    const docs = await ComplianceBlockModel.find({ userId: new Types.ObjectId(userId) }).sort({ blockedAt: -1 }).lean();
    return docs.map(toComplianceBlockEvent);
  }
}
