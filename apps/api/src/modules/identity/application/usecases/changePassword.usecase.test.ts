import { describe, expect, it } from 'vitest';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { RevokedReason, UserSession } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { ChangePasswordUseCase } from './changePassword.usecase.js';

const USER = { id: 'u-1', passwordHash: 'hashed:Old-Passw0rd' } as User;

class FakeUsers {
  updates: Array<{ id: string; input: Partial<User> }> = [];
  constructor(private readonly user: User | null) {}
  async findById() {
    return this.user;
  }
  async update(id: string, input: Partial<User>) {
    this.updates.push({ id, input });
    return { ...(this.user as User), ...input };
  }
}

class FakeSessions {
  kept: Array<{ userId: string; keep: string | null; reason: RevokedReason }> = [];
  constructor(private readonly session: Partial<UserSession> | null) {}
  async findByRefreshTokenHash() {
    return this.session as UserSession | null;
  }
  async revokeOthersForUser(userId: string, keep: string | null, reason: RevokedReason) {
    this.kept.push({ userId, keep, reason });
  }
}

const hasher: PasswordHasherPort = { hash: async (p) => `hashed:${p}`, verify: async (p, h) => h === `hashed:${p}` };
const tokens = { generate: () => 'x', hash: (t: string) => `hash(${t})` } as RefreshTokenGeneratorPort;

function build(user: User | null = USER, session: Partial<UserSession> | null = null) {
  const users = new FakeUsers(user);
  const sessions = new FakeSessions(session);
  const useCase = new ChangePasswordUseCase(
    users as unknown as UserRepositoryPort,
    sessions as unknown as UserSessionRepositoryPort,
    hasher,
    tokens,
  );
  return { useCase, users, sessions };
}

describe('ChangePasswordUseCase', () => {
  it('stores only the hash of the new password', async () => {
    const { useCase, users } = build();
    await useCase.execute('u-1', 'Old-Passw0rd', 'N3w-Passw0rd!');
    expect(users.updates).toEqual([{ id: 'u-1', input: { passwordHash: 'hashed:N3w-Passw0rd!' } }]);
  });

  it('refuses a wrong current password and changes nothing', async () => {
    const { useCase, users, sessions } = build();
    await expect(useCase.execute('u-1', 'wrong-one', 'N3w-Passw0rd!')).rejects.toMatchObject({ statusCode: 403 });
    expect(users.updates).toEqual([]);
    expect(sessions.kept).toEqual([]);
  });

  it('refuses a new password equal to the current one', async () => {
    const { useCase, users } = build();
    await expect(useCase.execute('u-1', 'Old-Passw0rd', 'Old-Passw0rd')).rejects.toMatchObject({ statusCode: 400 });
    expect(users.updates).toEqual([]);
  });

  it('keeps the session the request came from and ends the rest', async () => {
    const { useCase, sessions } = build(USER, { id: 's-9', userId: 'u-1', revokedAt: null });
    await useCase.execute('u-1', 'Old-Passw0rd', 'N3w-Passw0rd!', 'raw');
    expect(sessions.kept).toEqual([{ userId: 'u-1', keep: 's-9', reason: 'PASSWORD_RESET' }]);
  });

  it('ends every session when the refresh token is missing, unknown or someone else\'s', async () => {
    for (const session of [null, { id: 's-1', userId: 'other', revokedAt: null }]) {
      const { useCase, sessions } = build(USER, session);
      await useCase.execute('u-1', 'Old-Passw0rd', 'N3w-Passw0rd!', 'raw');
      expect(sessions.kept).toEqual([{ userId: 'u-1', keep: null, reason: 'PASSWORD_RESET' }]);
    }
  });

  it('404s for a user that no longer exists', async () => {
    const { useCase } = build(null);
    await expect(useCase.execute('u-1', 'a', 'b')).rejects.toMatchObject({ statusCode: 404 });
  });
});
