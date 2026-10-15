import { AppError } from '@/shared/errors/AppError.js';
import type { PushTokenRepositoryPort } from '../../domain/pushToken.repository.port.js';

/** The phone registers its FCM token after login, and again whenever Firebase rotates it. */
export class PushTokenUseCase {
  constructor(private readonly tokens: PushTokenRepositoryPort) {}

  async register(userId: string, deviceId: string, token: string): Promise<void> {
    // A token belongs to one phone. If this phone was last signed in as someone else, that account must stop receiving its pushes.
    await this.tokens.clearTokens([token]);
    const stored = await this.tokens.setForDevice(userId, deviceId, token);
    if (!stored) throw AppError.notFound('No active session for this device.');
  }

  /** Idempotent: a device with no live session already has nothing to clear. */
  async unregister(userId: string, deviceId: string): Promise<void> {
    await this.tokens.setForDevice(userId, deviceId, null);
  }

  listForUsers(userIds: string[]): Promise<string[]> {
    return this.tokens.listForUsers(userIds);
  }

  clear(tokens: string[]): Promise<void> {
    return this.tokens.clearTokens(tokens);
  }
}
