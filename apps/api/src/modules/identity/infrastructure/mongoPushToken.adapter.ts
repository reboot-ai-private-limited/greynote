import { Types } from 'mongoose';
import type { PushTokenRepositoryPort } from '../domain/pushToken.repository.port.js';
import { UserSessionModel } from './userSession.schema.js';

const live = () => ({ revokedAt: null, expiresAt: { $gt: new Date() } });

export class MongoPushTokenAdapter implements PushTokenRepositoryPort {
  async setForDevice(userId: string, deviceId: string, token: string | null): Promise<boolean> {
    const result = await UserSessionModel.updateMany(
      { userId: new Types.ObjectId(userId), deviceId, ...live() },
      { pushToken: token, pushTokenAt: token ? new Date() : null },
    );
    return result.matchedCount > 0;
  }

  async clearTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await UserSessionModel.updateMany({ pushToken: { $in: tokens } }, { pushToken: null, pushTokenAt: null });
  }

  async listForUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const tokens = await UserSessionModel.distinct('pushToken', {
      userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      pushToken: { $ne: null },
      ...live(),
    });
    return tokens.filter((t): t is string => typeof t === 'string' && t.length > 0);
  }
}
