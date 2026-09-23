import type { UserSession } from './userSession.entity.js';

export interface UserSessionRepositoryPort {
  create(input: Omit<UserSession, 'id'>): Promise<UserSession>;
  findActiveByDeviceId(userId: string, deviceId: string): Promise<UserSession | null>;
  countActive(userId: string): Promise<number>;
  findByRefreshTokenHash(hash: string): Promise<UserSession | null>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
