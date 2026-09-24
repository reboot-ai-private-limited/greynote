import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '../domain/transactionRunner.port.js';
import type { RevokedReason, UserSession } from '../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../domain/userSession.repository.port.js';
import { UserSessionModel, type UserSessionDoc } from './userSession.schema.js';

function toUserSession(doc: UserSessionDoc & { _id: unknown }): UserSession {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    deviceId: doc.deviceId,
    deviceName: doc.deviceName,
    deviceModel: doc.deviceModel,
    platform: doc.platform,
    refreshTokenHash: doc.refreshTokenHash,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    lastActiveAt: doc.lastActiveAt,
    revokedAt: doc.revokedAt,
    revokedReason: doc.revokedReason ?? null,
  };
}

const activeFilter = () => ({ revokedAt: null, expiresAt: { $gt: new Date() } });

export class MongoUserSessionAdapter implements UserSessionRepositoryPort {
  async create(input: Omit<UserSession, 'id' | 'revokedAt' | 'revokedReason'>): Promise<UserSession> {
    const doc = await UserSessionModel.create({
      ...input,
      userId: new Types.ObjectId(input.userId),
      revokedAt: null,
      revokedReason: null,
    });
    return toUserSession(doc);
  }

  async findActiveByDeviceId(userId: string, deviceId: string): Promise<UserSession | null> {
    const doc = await UserSessionModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceId,
      ...activeFilter(),
    }).lean();
    return doc ? toUserSession(doc) : null;
  }

  async findActiveForUser(userId: string): Promise<UserSession[]> {
    const docs = await UserSessionModel.find({ userId: new Types.ObjectId(userId), ...activeFilter() })
      .sort({ lastActiveAt: -1 })
      .lean();
    return docs.map(toUserSession);
  }

  async countActive(userId: string): Promise<number> {
    return UserSessionModel.countDocuments({ userId: new Types.ObjectId(userId), ...activeFilter() });
  }

  async findByRefreshTokenHash(hash: string): Promise<UserSession | null> {
    const doc = await UserSessionModel.findOne({ refreshTokenHash: hash }).lean();
    return doc ? toUserSession(doc) : null;
  }

  async revoke(sessionId: string, reason: RevokedReason): Promise<void> {
    await UserSessionModel.updateOne(
      { _id: sessionId, revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeAllForUser(userId: string, reason: RevokedReason): Promise<void> {
    await UserSessionModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeActiveForDevice(
    userId: string,
    deviceId: string,
    reason: RevokedReason,
    ctx?: TransactionContext,
  ): Promise<void> {
    await UserSessionModel.updateMany(
      { userId: new Types.ObjectId(userId), deviceId, revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
      { ...(ctx ? { session: ctx as ClientSession } : {}) },
    );
  }
}
