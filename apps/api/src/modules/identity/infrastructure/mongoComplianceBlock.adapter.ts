import { Types, type ClientSession } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { ComplianceBlockEvent } from '../domain/complianceBlock.entity.js';
import type { ComplianceBlockRepositoryPort } from '../domain/complianceBlock.repository.port.js';
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

  async create(input: Omit<ComplianceBlockEvent, 'id'>, ctx?: TransactionContext): Promise<ComplianceBlockEvent> {
    const docs = await ComplianceBlockModel.create(
      [
        {
          userId: new Types.ObjectId(input.userId),
          reason: input.reason,
          blockedAt: input.blockedAt,
          unblockedBy: input.unblockedBy ? new Types.ObjectId(input.unblockedBy) : null,
          unblockedAt: input.unblockedAt,
        },
      ],
      { ...(ctx ? { session: ctx as ClientSession } : {}) },
    );
    const doc = docs[0];
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'COMPLIANCE_BLOCK_CREATE_RETURNED_EMPTY' });
    return toComplianceBlockEvent(doc);
  }

  async close(id: string, unblockedBy: string, unblockedAt: Date, ctx?: TransactionContext): Promise<void> {
    await ComplianceBlockModel.updateOne(
      { _id: id },
      { unblockedBy: new Types.ObjectId(unblockedBy), unblockedAt },
      { ...(ctx ? { session: ctx as ClientSession } : {}) },
    );
  }
}
