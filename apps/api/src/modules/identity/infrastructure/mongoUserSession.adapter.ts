import { Types } from 'mongoose';
import type { UserSession } from '../domain/userSession.entity.js';
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
  };
}

export class MongoUserSessionAdapter implements UserSessionRepositoryPort {
  async create(input: Omit<UserSession, 'id'>): Promise<UserSession> {
    const doc = await UserSessionModel.create({ ...input, userId: new Types.ObjectId(input.userId) });
    return toUserSession(doc);
  }

  async findActiveByDeviceId(userId: string, deviceId: string): Promise<UserSession | null> {
    const doc = await UserSessionModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();
    return doc ? toUserSession(doc) : null;
  }

  async countActive(userId: string): Promise<number> {
    return UserSessionModel.countDocuments({
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
  }

  async findByRefreshTokenHash(hash: string): Promise<UserSession | null> {
    const doc = await UserSessionModel.findOne({ refreshTokenHash: hash }).lean();
    return doc ? toUserSession(doc) : null;
  }

  async revoke(sessionId: string): Promise<void> {
    await UserSessionModel.updateOne({ _id: sessionId }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await UserSessionModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { revokedAt: new Date() },
    );
  }
}
