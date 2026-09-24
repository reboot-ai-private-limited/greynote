import { describe, expect, it } from 'vitest';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { RevokedReason, UserSession } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { LogoutUseCase } from './logout.usecase.js';

function makeSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash(raw-token)',
    deviceId: 'device-1',
    deviceName: 'Redmi',
    deviceModel: 'Note 12',
    platform: 'ANDROID',
    issuedAt: new Date('2026-09-01T00:00:00Z'),
    expiresAt: new Date('2026-10-01T00:00:00Z'),
    lastActiveAt: new Date('2026-09-01T00:00:00Z'),
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

class FakeUserSessionRepository implements Pick<UserSessionRepositoryPort, 'findByRefreshTokenHash' | 'revoke'> {
  lookedUpHashes: string[] = [];
  revoked: Array<{ sessionId: string; reason: RevokedReason }> = [];
  constructor(private readonly session: UserSession | null) {}
  async findByRefreshTokenHash(hash: string): Promise<UserSession | null> {
    this.lookedUpHashes.push(hash);
    return this.session;
  }
  async revoke(sessionId: string, reason: RevokedReason): Promise<void> {
    this.revoked.push({ sessionId, reason });
  }
}

const refreshTokenGenerator: RefreshTokenGeneratorPort = {
  generate: () => 'unused',
  hash: (t) => `hash(${t})`,
};

function makeUseCase(sessions: FakeUserSessionRepository): LogoutUseCase {
  return new LogoutUseCase(sessions as unknown as UserSessionRepositoryPort, refreshTokenGenerator);
}

describe('LogoutUseCase', () => {
  it("looks the session up by the token's hash, never the raw token, and revokes it", async () => {
    const sessions = new FakeUserSessionRepository(makeSession());

    await makeUseCase(sessions).execute('user-1', 'raw-token');

    expect(sessions.lookedUpHashes).toEqual(['hash(raw-token)']);
    expect(sessions.revoked).toEqual([{ sessionId: 'session-1', reason: 'LOGOUT' }]);
  });

  it('is an idempotent no-op when no session matches the token', async () => {
    const sessions = new FakeUserSessionRepository(null);

    await expect(makeUseCase(sessions).execute('user-1', 'raw-token')).resolves.toBeUndefined();
    expect(sessions.revoked).toEqual([]);
  });

  it("refuses to revoke another user's session with 403, and revokes nothing", async () => {
    const sessions = new FakeUserSessionRepository(makeSession({ userId: 'someone-else' }));

    await expect(makeUseCase(sessions).execute('user-1', 'raw-token')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(sessions.revoked).toEqual([]);
  });
});
