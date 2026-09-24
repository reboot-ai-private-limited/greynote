import type { TransactionContext } from './transactionRunner.port.js';
import type { RevokedReason, UserSession } from './userSession.entity.js';

export interface UserSessionRepositoryPort {
  create(input: Omit<UserSession, 'id' | 'revokedAt' | 'revokedReason'>): Promise<UserSession>;
  findActiveByDeviceId(userId: string, deviceId: string): Promise<UserSession | null>;
  /** Latest active session per device, for the Admin device list. */
  findActiveForUser(userId: string): Promise<UserSession[]>;
  countActive(userId: string): Promise<number>;
  findByRefreshTokenHash(hash: string): Promise<UserSession | null>;
  revoke(sessionId: string, reason: RevokedReason): Promise<void>;
  revokeAllForUser(userId: string, reason: RevokedReason): Promise<void>;
  revokeActiveForDevice(
    userId: string,
    deviceId: string,
    reason: RevokedReason,
    ctx?: TransactionContext,
  ): Promise<void>;
}
