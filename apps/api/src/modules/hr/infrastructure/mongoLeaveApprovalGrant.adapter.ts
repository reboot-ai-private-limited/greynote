import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LeaveApprovalGrant } from '../domain/leaveApprovalGrant.entity.js';
import type { LeaveApprovalGrantRepositoryPort } from '../domain/leaveApprovalGrant.repository.port.js';
import { LeaveApprovalGrantModel, type LeaveApprovalGrantDoc } from './leaveApprovalGrant.schema.js';

const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;

function toGrant(doc: LeaveApprovalGrantDoc & { _id: unknown }): LeaveApprovalGrant {
  return {
    id: String(doc._id),
    leaveId: String(doc.leaveId),
    userId: String(doc.userId),
    reason: doc.reason,
    grantedBy: String(doc.grantedBy),
    grantedAt: doc.grantedAt,
    expiresAt: doc.expiresAt,
    status: doc.status,
    usedAt: doc.usedAt,
    revokedAt: doc.revokedAt,
    revokedBy: doc.revokedBy === null ? null : String(doc.revokedBy),
  };
}

/** Still usable at `now`. */
const usable = (now: Date) => ({ status: 'OPEN', expiresAt: { $gt: now } });

export class MongoLeaveApprovalGrantAdapter implements LeaveApprovalGrantRepositoryPort {
  async findUsable(leaveId: string, now: Date): Promise<LeaveApprovalGrant | null> {
    const doc = await LeaveApprovalGrantModel.findOne({ leaveId: new Types.ObjectId(leaveId), ...usable(now) }).lean();
    return doc ? toGrant(doc) : null;
  }

  async create(input: Omit<LeaveApprovalGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date): Promise<LeaveApprovalGrant | null> {
    const leaveId = new Types.ObjectId(input.leaveId);
    // An expired grant still holds the one-OPEN slot until it is closed here.
    await LeaveApprovalGrantModel.updateMany({ leaveId, status: 'OPEN', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
    try {
      const doc = await LeaveApprovalGrantModel.create({ ...input, leaveId, userId: new Types.ObjectId(input.userId), grantedBy: new Types.ObjectId(input.grantedBy), status: 'OPEN' });
      return toGrant(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean> {
    const result = await LeaveApprovalGrantModel.updateOne({ _id: id, ...usable(now) }, { $set: { status: 'USED', usedAt: now } }, { session: ctx as ClientSession });
    return result.matchedCount === 1;
  }

  async revokeForLeave(leaveId: string, revokedBy: string, now: Date): Promise<LeaveApprovalGrant | null> {
    const doc = await LeaveApprovalGrantModel.findOneAndUpdate(
      { leaveId: new Types.ObjectId(leaveId), ...usable(now) },
      { $set: { status: 'REVOKED', revokedAt: now, revokedBy: new Types.ObjectId(revokedBy) } },
      { new: true },
    ).lean();
    return doc ? toGrant(doc) : null;
  }
}
