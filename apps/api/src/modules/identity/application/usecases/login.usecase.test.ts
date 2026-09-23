import { beforeEach, describe, expect, it } from 'vitest';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSession } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { LoginUseCase } from './login.usecase.js';

const FIELD_ROLE: Role = { id: 'role-field', name: 'FIELD' };
const ADMIN_ROLE: Role = { id: 'role-admin', name: 'ADMIN' };

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    employeeCode: 'MR001',
    name: 'Jane MR',
    email: null,
    phone: null,
    status: 'pending',
    roleId: FIELD_ROLE.id,
    passwordHash: 'correct-hash',
    lastLoginAt: null,
    isBlocked: false,
    ...overrides,
  };
}

class FakeUserRepository implements Pick<UserRepositoryPort, 'findByEmployeeCode' | 'update'> {
  updates: Array<{ id: string; input: Partial<User> }> = [];
  constructor(private readonly user: User | null) {}
  async findByEmployeeCode(): Promise<User | null> {
    return this.user;
  }
  async update(id: string, input: Partial<User>): Promise<User> {
    this.updates.push({ id, input });
    return { ...(this.user as User), ...input };
  }
}

class FakeRoleRepository implements Pick<RoleRepositoryPort, 'findById'> {
  constructor(private readonly role: Role | null) {}
  async findById(): Promise<Role | null> {
    return this.role;
  }
}

class FakeUserSessionRepository
  implements Pick<UserSessionRepositoryPort, 'findActiveByDeviceId' | 'countActive' | 'revoke' | 'create'>
{
  revoked: string[] = [];
  created: Array<Omit<UserSession, 'id'>> = [];
  constructor(
    private readonly existingSession: UserSession | null,
    private readonly activeCount: number,
  ) {}
  async findActiveByDeviceId(): Promise<UserSession | null> {
    return this.existingSession;
  }
  async countActive(): Promise<number> {
    return this.activeCount;
  }
  async revoke(sessionId: string): Promise<void> {
    this.revoked.push(sessionId);
  }
  async create(input: Omit<UserSession, 'id'>): Promise<UserSession> {
    this.created.push(input);
    return { ...input, id: 'session-new' };
  }
}

const passwordHasher: PasswordHasherPort = {
  hash: async (p) => `hashed:${p}`,
  verify: async (plain, hash) => hash === 'correct-hash' && plain === 'correct-password',
};

const accessTokenSigner: AccessTokenSignerPort = { sign: () => 'signed-jwt' };
const refreshTokenGenerator: RefreshTokenGeneratorPort = {
  generate: () => 'raw-refresh-token',
  hash: (t) => `hash(${t})`,
};

function makeConfigProvider(maxDevices: string): ConfigProviderPort {
  return { get: async () => maxDevices };
}

const opts = { accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 };
const loginInput = {
  employeeCode: 'MR001',
  password: 'correct-password',
  deviceId: 'device-new',
  deviceName: 'Redmi',
  deviceModel: 'Note 12',
  platform: 'ANDROID' as const,
};

describe('LoginUseCase', () => {
  let userRepository: FakeUserRepository;

  beforeEach(() => {
    userRepository = new FakeUserRepository(makeUser());
  });

  it('rejects an unknown employee code without revealing which field was wrong', async () => {
    const useCase = new LoginUseCase(
      new FakeUserRepository(null) as unknown as UserRepositoryPort,
      new FakeRoleRepository(FIELD_ROLE) as unknown as RoleRepositoryPort,
      new FakeUserSessionRepository(null, 0) as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a wrong password with the same message as an unknown employee code', async () => {
    const useCase = new LoginUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(FIELD_ROLE) as unknown as RoleRepositoryPort,
      new FakeUserSessionRepository(null, 0) as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    await expect(useCase.execute({ ...loginInput, password: 'wrong' })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid employee code or password.',
    });
  });

  it('rejects a FIELD login on a genuinely new device once the device limit is reached', async () => {
    const sessions = new FakeUserSessionRepository(null, 2); // already at the limit
    const useCase = new LoginUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(FIELD_ROLE) as unknown as RoleRepositoryPort,
      sessions as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(sessions.created).toHaveLength(0);
  });

  it('allows a FIELD login on a genuinely new device under the limit', async () => {
    const sessions = new FakeUserSessionRepository(null, 1); // one below the limit of 2
    const useCase = new LoginUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(FIELD_ROLE) as unknown as RoleRepositoryPort,
      sessions as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    const result = await useCase.execute(loginInput);
    expect(result.accessToken).toBe('signed-jwt');
    expect(sessions.created).toHaveLength(1);
  });

  it('replaces the session on re-login from an already-active device, without checking the limit', async () => {
    const existing: UserSession = {
      id: 'session-old',
      userId: 'user-1',
      deviceId: loginInput.deviceId,
      deviceName: 'Redmi',
      deviceModel: 'Note 12',
      platform: 'ANDROID',
      refreshTokenHash: 'old-hash',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      lastActiveAt: new Date(),
      revokedAt: null,
    };
    // Deliberately AT the limit — a re-login on the same device must not be blocked by this.
    const sessions = new FakeUserSessionRepository(existing, 2);
    const useCase = new LoginUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(FIELD_ROLE) as unknown as RoleRepositoryPort,
      sessions as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    const result = await useCase.execute(loginInput);
    expect(result.accessToken).toBe('signed-jwt');
    expect(sessions.revoked).toEqual(['session-old']);
    expect(sessions.created).toHaveLength(1);
  });

  it('never checks the device limit for a non-FIELD role', async () => {
    userRepository = new FakeUserRepository(makeUser({ roleId: ADMIN_ROLE.id }));
    const sessions = new FakeUserSessionRepository(null, 999); // would fail any limit check
    const useCase = new LoginUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(ADMIN_ROLE) as unknown as RoleRepositoryPort,
      sessions as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    const result = await useCase.execute(loginInput);
    expect(result.accessToken).toBe('signed-jwt');
  });

  it('succeeds for a blocked user — the compliance block gates submissions, not authentication', async () => {
    userRepository = new FakeUserRepository(makeUser({ isBlocked: true }));
    const sessions = new FakeUserSessionRepository(null, 0);
    const useCase = new LoginUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(FIELD_ROLE) as unknown as RoleRepositoryPort,
      sessions as unknown as UserSessionRepositoryPort,
      passwordHasher,
      accessTokenSigner,
      refreshTokenGenerator,
      makeConfigProvider('2'),
      opts,
    );
    await expect(useCase.execute(loginInput)).resolves.toMatchObject({ accessToken: 'signed-jwt' });
  });
});
