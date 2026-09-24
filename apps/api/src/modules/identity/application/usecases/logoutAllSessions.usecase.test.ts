import { describe, expect, it } from 'vitest';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { LogoutAllSessionsUseCase } from './logoutAllSessions.usecase.js';

const TARGET: User = {
  id: 'user-1',
  employeeCode: 'MR001',
  name: 'Jane MR',
  email: null,
  phone: null,
  status: 'active',
  roleId: 'role-field',
  passwordHash: 'hash',
  lastLoginAt: null,
  isBlocked: false,
};

class FakeUserRepository implements Pick<UserRepositoryPort, 'findById'> {
  constructor(private readonly user: User | null) {}
  async findById(): Promise<User | null> {
    return this.user;
  }
}

class FakeUserSessionRepository implements Pick<UserSessionRepositoryPort, 'revokeAllForUser'> {
  revokedForUsers: string[] = [];
  async revokeAllForUser(userId: string): Promise<void> {
    this.revokedForUsers.push(userId);
  }
}

function makeUseCase(user: User | null, sessions: FakeUserSessionRepository): LogoutAllSessionsUseCase {
  return new LogoutAllSessionsUseCase(
    new FakeUserRepository(user) as unknown as UserRepositoryPort,
    sessions as unknown as UserSessionRepositoryPort,
  );
}

describe('LogoutAllSessionsUseCase', () => {
  it("revokes every session belonging to the target user, and only that user's", async () => {
    const sessions = new FakeUserSessionRepository();

    await makeUseCase(TARGET, sessions).execute('user-1');

    expect(sessions.revokedForUsers).toEqual(['user-1']);
  });

  it('404s for an unknown user and revokes nothing', async () => {
    const sessions = new FakeUserSessionRepository();

    await expect(makeUseCase(null, sessions).execute('ghost')).rejects.toMatchObject({ statusCode: 404 });
    expect(sessions.revokedForUsers).toEqual([]);
  });
});
