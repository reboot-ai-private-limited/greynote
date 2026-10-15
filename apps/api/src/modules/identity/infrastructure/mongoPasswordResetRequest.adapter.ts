import { Types } from 'mongoose';
import type { PasswordResetRequest } from '../domain/passwordResetRequest.entity.js';
import type { PasswordResetRequestRepositoryPort } from '../domain/passwordResetRequest.repository.port.js';
import { PasswordResetRequestModel, type PasswordResetRequestDoc } from './passwordResetRequest.schema.js';

function toEntity(doc: PasswordResetRequestDoc & { _id: unknown }): PasswordResetRequest {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    otpHash: doc.otpHash,
    expiresAt: doc.expiresAt,
    attempts: doc.attempts,
    usedAt: doc.usedAt,
    createdAt: doc.createdAt,
  };
}

export class MongoPasswordResetRequestAdapter implements PasswordResetRequestRepositoryPort {
  async create(input: Omit<PasswordResetRequest, 'id'>): Promise<PasswordResetRequest> {
    const doc = await PasswordResetRequestModel.create({ ...input, userId: new Types.ObjectId(input.userId) });
    return toEntity(doc.toObject());
  }

  countCreatedSince(since: Date): Promise<number> {
    return PasswordResetRequestModel.countDocuments({ createdAt: { $gte: since } });
  }

  async findOpenForUser(userId: string, now: Date): Promise<PasswordResetRequest | null> {
    const doc = await PasswordResetRequestModel.findOne({
      userId: new Types.ObjectId(userId),
      usedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();
    return doc ? toEntity(doc) : null;
  }

  async addAttempt(id: string): Promise<number> {
    const doc = await PasswordResetRequestModel.findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true }).lean();
    return doc?.attempts ?? 0;
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    const result = await PasswordResetRequestModel.updateOne({ _id: id, usedAt: null }, { $set: { usedAt: at } });
    return result.modifiedCount === 1;
  }

  async closeOpenForUser(userId: string, at: Date): Promise<void> {
    await PasswordResetRequestModel.updateMany({ userId: new Types.ObjectId(userId), usedAt: null }, { $set: { usedAt: at } });
  }

  async delete(id: string): Promise<void> {
    await PasswordResetRequestModel.deleteOne({ _id: id });
  }
}
