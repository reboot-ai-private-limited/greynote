import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { UserHqAssignment } from '../domain/userHqAssignment.entity.js';
import type { UserHqAssignmentRepositoryPort } from '../domain/userHqAssignment.repository.port.js';
import { UserHqAssignmentModel, type UserHqAssignmentDoc } from './userHqAssignment.schema.js';

function toAssignment(doc: UserHqAssignmentDoc & { _id: unknown }): UserHqAssignment {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    hqId: String(doc.hqId),
    status: doc.status,
    assignedAt: doc.assignedAt,
    assignedBy: String(doc.assignedBy),
    unassignedAt: doc.unassignedAt,
    unassignedBy: doc.unassignedBy === null ? null : String(doc.unassignedBy),
  };
}

const session = (ctx: TransactionContext) => ctx as ClientSession;

export class MongoUserHqAssignmentAdapter implements UserHqAssignmentRepositoryPort {
  async findActive(userId: string): Promise<UserHqAssignment | null> {
    const doc = await UserHqAssignmentModel.findOne({ userId: new Types.ObjectId(userId), status: 'active' }).lean();
    return doc ? toAssignment(doc) : null;
  }

  async listForUser(userId: string): Promise<UserHqAssignment[]> {
    const docs = await UserHqAssignmentModel.find({ userId: new Types.ObjectId(userId) }).sort({ assignedAt: -1 }).lean();
    return docs.map(toAssignment);
  }

  async endActive(userId: string, endedBy: string, ctx: TransactionContext): Promise<void> {
    await UserHqAssignmentModel.updateOne(
      { userId: new Types.ObjectId(userId), status: 'active' },
      { status: 'inactive', unassignedAt: new Date(), unassignedBy: new Types.ObjectId(endedBy) },
      { session: session(ctx) },
    );
  }

  async create(
    input: { userId: string; hqId: string; assignedBy: string },
    ctx: TransactionContext,
  ): Promise<UserHqAssignment | null> {
    try {
      const [doc] = await UserHqAssignmentModel.create(
        [
          {
            userId: new Types.ObjectId(input.userId),
            hqId: new Types.ObjectId(input.hqId),
            status: 'active',
            assignedAt: new Date(),
            assignedBy: new Types.ObjectId(input.assignedBy),
          },
        ],
        { session: session(ctx) },
      );
      return doc ? toAssignment(doc.toObject()) : null;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
  }
}
