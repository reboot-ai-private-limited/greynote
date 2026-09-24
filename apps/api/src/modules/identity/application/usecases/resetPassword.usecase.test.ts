import { describe, expect, it } from 'vitest';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { RevokedReason } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { ResetPasswordUseCase } from './resetPassword.usecase.js';

class FakeUsers implements Pick<UserRepositoryPort, 'findById' | 'update'> {
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

class FakeSessions implements Pick<UserSessionRepositoryPort, 'revokeAllForUser'> {
  revoked: Array<{ userId: string; reason: RevokedReason }> = [];
  async revokeAllForUser(userId: string, reason: RevokedReason) {
    this.revoked.push({ userId, reason });
  }
}

const hasher: PasswordHasherPort = { hash: async (p) => `hashed:${p}`, verify: async () => true };
const USER = { id: 'mr-1', passwordHash: 'old-hash' } as User;

function build(user: User | null) {
  const users = new FakeUsers(user);
  const sessions = new FakeSessions();
  const useCase = new ResetPasswordUseCase(
    users as unknown as UserRepositoryPort,
    sessions as unknown as UserSessionRepositoryPort,
    hasher,
  );
  return { useCase, users, sessions };
}

describe('ResetPasswordUseCase', () => {
  it('stores only the hash of the new password, never the plaintext', async () => {
    const { useCase, users } = build(USER);
    await useCase.execute('mr-1', 'N3w-Passw0rd!');
    expect(users.updates).toEqual([{ id: 'mr-1', input: { passwordHash: 'hashed:N3w-Passw0rd!' } }]);
  });

  it('ends every session the user has, with reason PASSWORD_RESET', async () => {
    const { useCase, sessions } = build(USER);
    await useCase.execute('mr-1', 'N3w-Passw0rd!');
    expect(sessions.revoked).toEqual([{ userId: 'mr-1', reason: 'PASSWORD_RESET' }]);
  });

  it('404s for an unknown user and changes nothing', async () => {
    const { useCase, users, sessions } = build(null);
    await expect(useCase.execute('ghost', 'N3w-Passw0rd!')).rejects.toMatchObject({ statusCode: 404 });
    expect(users.updates).toHaveLength(0);
    expect(sessions.revoked).toHaveLength(0);
  });
});
