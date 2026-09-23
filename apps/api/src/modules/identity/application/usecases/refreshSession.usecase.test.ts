import { describe, expect, it } from 'vitest';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSession } from '../../domain/userSession.entity.js';
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
    ...overrides,
  };
}

class FakeUserSessionRepository
  implements
    Pick<UserSessionRepositoryPort, 'findByRefreshTokenHash' | 'revoke' | 'revokeAllForUser' | 'create'>
{
  revoked: string[] = [];
  revokedAllFor: string[] = [];
  created: Array<Omit<UserSession, 'id'>> = [];
  constructor(private readonly session: UserSession | null) {}
  async findByRefreshTokenHash(): Promise<UserSession | null> {
    return this.session;
  }
  async revoke(sessionId: string): Promise<void> {
    this.revoked.push(sessionId);
  }
  async revokeAllForUser(userId: string): Promise<void> {
    this.revokedAllFor.push(userId);
  }
  async create(input: Omit<UserSession, 'id'>): Promise<UserSession> {
    this.created.push(input);
    return { ...input, id: 'session-new' };
  }
}

const userRepository: Pick<UserRepositoryPort, 'findById'> = { findById: async () => USER };
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
    const sessions = new FakeUserSessionRepository(makeSession({ revokedAt: new Date() }));
    const useCase = buildUseCase(sessions);
    await expect(useCase.execute('raw-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(sessions.revokedAllFor).toEqual([USER.id]);
    expect(sessions.created).toHaveLength(0);
  });

  it('rejects a naturally expired token without revoking every session (not theft)', async () => {
    const sessions = new FakeUserSessionRepository(makeSession({ expiresAt: new Date(Date.now() - 1000) }));
    const useCase = buildUseCase(sessions);
    await expect(useCase.execute('raw-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(sessions.revokedAllFor).toHaveLength(0);
  });

  it('rotates a valid session: revokes the old row and issues a new pair for the same device', async () => {
    const sessions = new FakeUserSessionRepository(makeSession());
    const useCase = buildUseCase(sessions);
    const result = await useCase.execute('raw-token');

    expect(sessions.revoked).toEqual(['session-1']);
    expect(sessions.created).toHaveLength(1);
    expect(sessions.created[0]).toMatchObject({ deviceId: 'device-1', userId: USER.id });
    expect(result).toEqual({ accessToken: 'new-jwt', refreshToken: 'new-raw-token', expiresIn: 900 });
  });
});
