import { describe, expect, it } from 'vitest';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { RevokedReason, UserSession } from '../../domain/userSession.entity.js';
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

function makeDevice(overrides: Partial<UserDevice> = {}): UserDevice {
  return {
    id: 'device-row-1',
    userId: 'user-1',
    deviceId: 'phone-1',
    deviceName: 'Redmi',
    deviceModel: 'Xiaomi Note 12',
    platform: 'ANDROID',
    status: 'REGISTERED',
    requestedAt: new Date(),
    decidedAt: new Date(),
    decidedBy: 'admin-1',
    expiresAt: null,
    ...overrides,
  };
}

class FakeUserRepository implements Pick<UserRepositoryPort, 'findByEmployeeCode' | 'update'> {
  constructor(private readonly user: User | null) {}
  async findByEmployeeCode(): Promise<User | null> {
    return this.user;
  }
  async update(_id: string, input: Partial<User>): Promise<User> {
    return { ...(this.user as User), ...input };
  }
}

class FakeRoleRepository implements Pick<RoleRepositoryPort, 'findById'> {
  constructor(private readonly role: Role) {}
  async findById(): Promise<Role> {
    return this.role;
  }
}

type NewSession = Omit<UserSession, 'id' | 'revokedAt' | 'revokedReason'>;

class FakeUserSessionRepository
  implements Pick<UserSessionRepositoryPort, 'findActiveByDeviceId' | 'revoke' | 'create'>
{
  revoked: Array<{ sessionId: string; reason: RevokedReason }> = [];
  created: NewSession[] = [];
  constructor(private readonly existingSession: UserSession | null = null) {}
  async findActiveByDeviceId(): Promise<UserSession | null> {
    return this.existingSession;
  }
  async revoke(sessionId: string, reason: RevokedReason): Promise<void> {
    this.revoked.push({ sessionId, reason });
  }
  async create(input: NewSession): Promise<UserSession> {
    this.created.push(input);
    return { ...input, id: 'session-new', revokedAt: null, revokedReason: null };
  }
}

class FakeUserDeviceRepository implements Pick<UserDeviceRepositoryPort, 'findLive' | 'countSlotsUsed' | 'createPending'> {
  pendingCreated: string[] = [];
  lookups = 0;
  constructor(
    private readonly live: UserDevice | null,
    private readonly slotsUsed = 0,
  ) {}
  async findLive(): Promise<UserDevice | null> {
    this.lookups += 1;
    return this.live;
  }
  async countSlotsUsed(): Promise<number> {
    return this.slotsUsed;
  }
  async createPending(input: Pick<UserDevice, 'deviceId'>): Promise<UserDevice> {
    this.pendingCreated.push(input.deviceId);
    return makeDevice({ status: 'PENDING', deviceId: input.deviceId });
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
const config: ConfigProviderPort = { get: async () => '2' };

const loginInput = {
  employeeCode: 'MR001',
  password: 'correct-password',
  deviceId: 'phone-1',
  deviceName: 'Redmi',
  deviceModel: 'Xiaomi Note 12',
  platform: 'ANDROID' as const,
};

function build(opts: {
  user?: User | null;
  role?: Role;
  sessions?: FakeUserSessionRepository;
  devices?: FakeUserDeviceRepository;
}) {
  const sessions = opts.sessions ?? new FakeUserSessionRepository();
  const devices = opts.devices ?? new FakeUserDeviceRepository(makeDevice());
  const useCase = new LoginUseCase(
    new FakeUserRepository(opts.user === undefined ? makeUser() : opts.user) as unknown as UserRepositoryPort,
    new FakeRoleRepository(opts.role ?? FIELD_ROLE) as unknown as RoleRepositoryPort,
    sessions as unknown as UserSessionRepositoryPort,
    devices as unknown as UserDeviceRepositoryPort,
    passwordHasher,
    accessTokenSigner,
    refreshTokenGenerator,
    config,
    { accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 },
  );
  return { useCase, sessions, devices };
}

describe('LoginUseCase — credentials', () => {
  it('rejects an unknown employee code without revealing which field was wrong', async () => {
    const { useCase } = build({ user: null });
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a wrong password with the same message, before any device lookup', async () => {
    const { useCase, devices } = build({});
    await expect(useCase.execute({ ...loginInput, password: 'wrong' })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid employee code or password.',
    });
    expect(devices.lookups).toBe(0);
  });

  it('succeeds for a blocked user — the compliance block gates submissions, not authentication', async () => {
    const { useCase } = build({ user: makeUser({ isBlocked: true }) });
    await expect(useCase.execute(loginInput)).resolves.toMatchObject({ accessToken: 'signed-jwt' });
  });
});

describe('LoginUseCase — FIELD device registry', () => {
  it('logs in on a REGISTERED device', async () => {
    const { useCase, sessions } = build({});
    const result = await useCase.execute(loginInput);
    expect(result.accessToken).toBe('signed-jwt');
    expect(sessions.created).toHaveLength(1);
  });

  it('replaces the existing session on re-login from the same registered device', async () => {
    const existing = { id: 'session-old' } as UserSession;
    const { useCase, sessions } = build({ sessions: new FakeUserSessionRepository(existing) });
    await useCase.execute(loginInput);
    expect(sessions.revoked).toEqual([{ sessionId: 'session-old', reason: 'ROTATED' }]);
    expect(sessions.created).toHaveLength(1);
  });

  it('turns a brand-new phone into a PENDING request, even the very first one, and does not log in', async () => {
    const devices = new FakeUserDeviceRepository(null, 0);
    const { useCase, sessions } = build({ devices });
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { reason: 'DEVICE_APPROVAL_PENDING' },
    });
    expect(devices.pendingCreated).toEqual(['phone-1']);
    expect(sessions.created).toHaveLength(0);
  });

  it('does not create a duplicate request for a phone that is already PENDING', async () => {
    const devices = new FakeUserDeviceRepository(makeDevice({ status: 'PENDING' }), 1);
    const { useCase } = build({ devices });
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { reason: 'DEVICE_APPROVAL_PENDING' },
    });
    expect(devices.pendingCreated).toHaveLength(0);
  });

  it('refuses a REJECTED phone with 403 and tells it when it can retry', async () => {
    const retryAfter = new Date('2026-10-01T00:00:00Z');
    const devices = new FakeUserDeviceRepository(makeDevice({ status: 'REJECTED', expiresAt: retryAfter }));
    const { useCase, sessions } = build({ devices });
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({
      statusCode: 403,
      publicDetails: { reason: 'DEVICE_REJECTED', retryAfter },
    });
    expect(devices.pendingCreated).toHaveLength(0);
    expect(sessions.created).toHaveLength(0);
  });

  it('at the limit, refuses a new phone WITHOUT creating a request', async () => {
    const devices = new FakeUserDeviceRepository(null, 2);
    const { useCase } = build({ devices });
    await expect(useCase.execute(loginInput)).rejects.toMatchObject({
      statusCode: 409,
      message: 'You already have 2 devices. Ask Admin to remove an old device first.',
      publicDetails: { reason: 'DEVICE_LIMIT_REACHED', limit: 2 },
    });
    expect(devices.pendingCreated).toHaveLength(0);
  });

  it('never consults the device registry for a non-FIELD role', async () => {
    const devices = new FakeUserDeviceRepository(null, 999);
    const { useCase } = build({ user: makeUser({ roleId: ADMIN_ROLE.id }), role: ADMIN_ROLE, devices });
    await expect(useCase.execute(loginInput)).resolves.toMatchObject({ accessToken: 'signed-jwt' });
    expect(devices.lookups).toBe(0);
    expect(devices.pendingCreated).toHaveLength(0);
  });
});
