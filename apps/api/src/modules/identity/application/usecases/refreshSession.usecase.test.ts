import { describe, expect, it } from 'vitest';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { RevokedReason, UserSession } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { RefreshSessionUseCase } from './refreshSession.usecase.js';

const ROLE: Role = { id: 'role-field', name: 'FIELD' };
const USER: User = {
  id: 'user-1',
  employeeCode: 'MR001',
  name: 'Jane MR',
  email: null,
  phone: null,
  status: 'pending',
  roleId: ROLE.id,
  passwordHash: 'x',
  lastLoginAt: null,
  isBlocked: false,
};

function makeSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'session-1',
    userId: USER.id,
    deviceId: 'device-1',
    deviceName: 'Redmi',
    deviceModel: 'Note 12',
    platform: 'ANDROID',
    refreshTokenHash: 'hash(raw-token)',
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    lastActiveAt: new Date(),
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

type NewSession = Omit<UserSession, 'id' | 'revokedAt' | 'revokedReason'>;

class FakeUserSessionRepository
  implements
    Pick<UserSessionRepositoryPort, 'findByRefreshTokenHash' | 'revoke' | 'revokeAllForUser' | 'create'>
{
  revoked: Array<{ sessionId: string; reason: RevokedReason }> = [];
  revokedAllFor: Array<{ userId: string; reason: RevokedReason }> = [];
  created: NewSession[] = [];
  constructor(private readonly session: UserSession | null) {}
  async findByRefreshTokenHash(): Promise<UserSession | null> {
    return this.session;
  }
  async revoke(sessionId: string, reason: RevokedReason): Promise<void> {
    this.revoked.push({ sessionId, reason });
  }
  async revokeAllForUser(userId: string, reason: RevokedReason): Promise<void> {
    this.revokedAllFor.push({ userId, reason });
  }
  async create(input: NewSession): Promise<UserSession> {
    this.created.push(input);
    return { ...input, id: 'session-new', revokedAt: null, revokedReason: null };
  }
}

let currentUser: User = USER;
const userRepository: Pick<UserRepositoryPort, 'findById'> = { findById: async () => currentUser };
const roleRepository: Pick<RoleRepositoryPort, 'findById'> = { findById: async () => ROLE };
const accessTokenSigner: AccessTokenSignerPort = { sign: () => 'new-jwt' };
const refreshTokenGenerator: RefreshTokenGeneratorPort = {
  generate: () => 'new-raw-token',
  hash: (t) => `hash(${t})`,
};
const opts = { accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 };

function buildUseCase(sessions: FakeUserSessionRepository): RefreshSessionUseCase {
  return new RefreshSessionUseCase(
    userRepository as UserRepositoryPort,
    roleRepository as RoleRepositoryPort,
    sessions as unknown as UserSessionRepositoryPort,
    accessTokenSigner,
    refreshTokenGenerator,
    opts,
  );
}

describe('RefreshSessionUseCase', () => {
  it('rejects a refresh token that matches no session', async () => {
    const useCase = buildUseCase(new FakeUserSessionRepository(null));
    await expect(useCase.execute('raw-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('treats a reused (already-rotated) refresh token as theft and revokes every session for the user', async () => {
    const sessions = new FakeUserSessionRepository(makeSession({ revokedAt: new Date(), revokedReason: 'ROTATED' }));
    const useCase = buildUseCase(sessions);
    await expect(useCase.execute('raw-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(sessions.revokedAllFor).toEqual([{ userId: USER.id, reason: 'THEFT' }]);
    expect(sessions.created).toHaveLength(0);
  });

  it.each(['LOGOUT', 'ADMIN', 'PASSWORD_RESET', 'THEFT'] as const)(
    'rejects a token revoked for %s with 401 but does NOT revoke the user\'s other sessions',
    async (reason) => {
      const sessions = new FakeUserSessionRepository(makeSession({ revokedAt: new Date(), revokedReason: reason }));
      await expect(buildUseCase(sessions).execute('raw-token')).rejects.toMatchObject({ statusCode: 401 });
      expect(sessions.revokedAllFor).toHaveLength(0);
      expect(sessions.created).toHaveLength(0);
    },
  );

  it('rejects a naturally expired token without revoking every session (not theft)', async () => {
    const sessions = new FakeUserSessionRepository(makeSession({ expiresAt: new Date(Date.now() - 1000) }));
    const useCase = buildUseCase(sessions);
    await expect(useCase.execute('raw-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(sessions.revokedAllFor).toHaveLength(0);
  });

  it('refuses to refresh a deactivated account, ends every session, and issues nothing', async () => {
    currentUser = { ...USER, status: 'inactive' };
    try {
      const sessions = new FakeUserSessionRepository(makeSession());
      await expect(buildUseCase(sessions).execute('raw-token')).rejects.toMatchObject({
        statusCode: 401,
        message: 'This account has been deactivated. Contact your administrator.',
      });
      expect(sessions.revokedAllFor).toEqual([{ userId: USER.id, reason: 'ADMIN' }]);
      expect(sessions.created).toHaveLength(0);
      expect(sessions.revoked).toHaveLength(0);
    } finally {
      currentUser = USER;
    }
  });

  it('rotates a valid session: revokes the old row and issues a new pair for the same device', async () => {
    const sessions = new FakeUserSessionRepository(makeSession());
    const useCase = buildUseCase(sessions);
    const result = await useCase.execute('raw-token');

    expect(sessions.revoked).toEqual([{ sessionId: 'session-1', reason: 'ROTATED' }]);
    expect(sessions.created).toHaveLength(1);
    expect(sessions.created[0]).toMatchObject({ deviceId: 'device-1', userId: USER.id });
    expect(result).toEqual({ accessToken: 'new-jwt', refreshToken: 'new-raw-token', expiresIn: 900 });
  });
});
