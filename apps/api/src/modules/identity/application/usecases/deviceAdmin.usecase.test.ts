import { beforeEach, describe, expect, it } from 'vitest';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { TransactionContext, TransactionRunnerPort } from '../../domain/transactionRunner.port.js';
import type { User } from '../../domain/user.entity.js';
import type { DeviceStatus, UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { RevokedReason, UserSession } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { ApproveDeviceUseCase } from './approveDevice.usecase.js';
import { ListPendingDevicesUseCase } from './listPendingDevices.usecase.js';
import { ListUserDevicesUseCase } from './listUserDevices.usecase.js';
import { LogoutDeviceUseCase } from './logoutDevice.usecase.js';
import { RejectDeviceUseCase } from './rejectDevice.usecase.js';
import { RemoveDeviceUseCase } from './removeDevice.usecase.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function device(id: string, status: DeviceStatus, overrides: Partial<UserDevice> = {}): UserDevice {
  return {
    id,
    userId: 'mr-1',
    deviceId: `phone-${id}`,
    deviceName: `Phone ${id}`,
    deviceModel: 'Xiaomi Redmi',
    platform: 'ANDROID',
    status,
    requestedAt: new Date('2026-09-01T00:00:00Z'),
    decidedAt: null,
    decidedBy: null,
    expiresAt: null,
    ...overrides,
  };
}

class FakeDevices implements UserDeviceRepositoryPort {
  rows = new Map<string, UserDevice>();
  ctxSeen: TransactionContext[] = [];
  constructor(devices: UserDevice[]) {
    for (const d of devices) this.rows.set(d.id, d);
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findLive(): Promise<UserDevice | null> {
    throw new Error('not used');
  }
  async countSlotsUsed(userId: string) {
    return [...this.rows.values()].filter((d) => d.userId === userId && ['PENDING', 'REGISTERED'].includes(d.status)).length;
  }
  async countRegistered(userId: string) {
    return [...this.rows.values()].filter((d) => d.userId === userId && d.status === 'REGISTERED').length;
  }
  async createPending(): Promise<UserDevice> {
    throw new Error('not used');
  }
  async setStatus(id: string, change: { status: DeviceStatus; decidedBy: string; expiresAt?: Date | null }, ctx?: TransactionContext) {
    if (ctx !== undefined) this.ctxSeen.push(ctx);
    const updated = { ...(this.rows.get(id) as UserDevice), ...change, expiresAt: change.expiresAt ?? null, decidedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }
  async listForUser(userId: string) {
    return [...this.rows.values()].filter((d) => d.userId === userId);
  }
  async listPending() {
    return [...this.rows.values()].filter((d) => d.status === 'PENDING');
  }
}

class FakeSessions implements Pick<UserSessionRepositoryPort, 'revokeActiveForDevice' | 'findActiveForUser'> {
  revokedDevices: Array<{ userId: string; deviceId: string; reason: RevokedReason; inTx: boolean }> = [];
  constructor(private readonly active: UserSession[] = []) {}
  async revokeActiveForDevice(userId: string, deviceId: string, reason: RevokedReason, ctx?: TransactionContext) {
    this.revokedDevices.push({ userId, deviceId, reason, inTx: ctx !== undefined });
  }
  async findActiveForUser() {
    return this.active;
  }
}

const tx: TransactionRunnerPort = { run: (fn) => fn('tx-ctx') };
const config = (limit = '2', ttlDays = '7'): ConfigProviderPort => ({
  get: async (key) => (key === 'MAX_REGISTERED_DEVICES_FIELD' ? limit : ttlDays),
});
const MR = { id: 'mr-1', employeeCode: 'MR001', name: 'Jane MR' } as User;
const users = { findById: async (id: string) => (id === 'mr-1' ? MR : null) } as unknown as UserRepositoryPort;
const asSessions = (s: FakeSessions) => s as unknown as UserSessionRepositoryPort;

describe('device admin: ownership and status guards', () => {
  let devices: FakeDevices;
  beforeEach(() => {
    devices = new FakeDevices([device('a', 'PENDING'), device('b', 'REGISTERED'), device('x', 'PENDING', { userId: 'other' })]);
  });

  it("404s when the device row belongs to a different employee than the URL's", async () => {
    await expect(new ApproveDeviceUseCase(devices, config()).execute('admin', 'mr-1', 'x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('404s for a device row that does not exist', async () => {
    await expect(new RejectDeviceUseCase(devices, config()).execute('admin', 'mr-1', 'nope')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('409s approving a device that is not PENDING', async () => {
    await expect(new ApproveDeviceUseCase(devices, config()).execute('admin', 'mr-1', 'b')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('409s removing a device that is not REGISTERED', async () => {
    const useCase = new RemoveDeviceUseCase(devices, asSessions(new FakeSessions()), tx);
    await expect(useCase.execute('admin', 'mr-1', 'a')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('ApproveDeviceUseCase', () => {
  it('registers a pending device and records who approved it', async () => {
    const devices = new FakeDevices([device('a', 'PENDING')]);
    const result = await new ApproveDeviceUseCase(devices, config()).execute('admin-9', 'mr-1', 'a');
    expect(result).toMatchObject({ status: 'REGISTERED', decidedBy: 'admin-9' });
  });

  it('409s if registered devices are already at the limit (setting lowered after the request)', async () => {
    const devices = new FakeDevices([device('a', 'PENDING'), device('b', 'REGISTERED')]);
    await expect(new ApproveDeviceUseCase(devices, config('1')).execute('admin', 'mr-1', 'a')).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { limit: 1 },
    });
    expect(devices.rows.get('a')?.status).toBe('PENDING');
  });
});

describe('RejectDeviceUseCase', () => {
  it('rejects and sets expiresAt REJECTED_DEVICE_TTL_DAYS from now', async () => {
    const devices = new FakeDevices([device('a', 'PENDING')]);
    const before = Date.now();
    const result = await new RejectDeviceUseCase(devices, config('2', '3')).execute('admin', 'mr-1', 'a');
    expect(result.status).toBe('REJECTED');
    const expires = (result.expiresAt as Date).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 3 * DAY_MS);
    expect(expires).toBeLessThanOrEqual(Date.now() + 3 * DAY_MS);
  });
});

describe('RemoveDeviceUseCase', () => {
  it('marks the device REMOVED and ends its sessions in one transaction, freeing a slot', async () => {
    const devices = new FakeDevices([device('a', 'REGISTERED'), device('b', 'REGISTERED')]);
    const sessions = new FakeSessions();
    expect(await devices.countSlotsUsed('mr-1')).toBe(2);

    await new RemoveDeviceUseCase(devices, asSessions(sessions), tx).execute('admin', 'mr-1', 'a');

    expect(devices.rows.get('a')?.status).toBe('REMOVED');
    expect(sessions.revokedDevices).toEqual([{ userId: 'mr-1', deviceId: 'phone-a', reason: 'ADMIN', inTx: true }]);
    expect(devices.ctxSeen).toEqual(['tx-ctx']);
    expect(await devices.countSlotsUsed('mr-1')).toBe(1);
  });
});

describe('LogoutDeviceUseCase', () => {
  it("ends the device's sessions but leaves it REGISTERED", async () => {
    const devices = new FakeDevices([device('a', 'REGISTERED')]);
    const sessions = new FakeSessions();
    await new LogoutDeviceUseCase(devices, asSessions(sessions)).execute('mr-1', 'a');
    expect(sessions.revokedDevices).toEqual([{ userId: 'mr-1', deviceId: 'phone-a', reason: 'ADMIN', inTx: false }]);
    expect(devices.rows.get('a')?.status).toBe('REGISTERED');
  });
});

describe('listing', () => {
  it('pending queue includes the employee code and name', async () => {
    const devices = new FakeDevices([device('a', 'PENDING'), device('b', 'REGISTERED')]);
    const result = await new ListPendingDevicesUseCase(devices, users).execute();
    expect(result).toEqual([expect.objectContaining({ id: 'a', employeeCode: 'MR001', employeeName: 'Jane MR' })]);
  });

  it("an employee's devices show which registered ones are logged in", async () => {
    const devices = new FakeDevices([device('a', 'REGISTERED'), device('b', 'REGISTERED'), device('c', 'REJECTED')]);
    const lastActiveAt = new Date('2026-09-20T10:00:00Z');
    const sessions = new FakeSessions([{ deviceId: 'phone-a', lastActiveAt } as UserSession]);
    const result = await new ListUserDevicesUseCase(users, devices, asSessions(sessions)).execute('mr-1');
    const byId = Object.fromEntries(result.map((d) => [d.id, d]));
    expect(byId.a).toMatchObject({ loggedIn: true, lastActiveAt });
    expect(byId.b).toMatchObject({ loggedIn: false, lastActiveAt: null });
    expect(byId.c).toMatchObject({ loggedIn: false });
  });

  it('404s for an unknown employee', async () => {
    const useCase = new ListUserDevicesUseCase(users, new FakeDevices([]), asSessions(new FakeSessions()));
    await expect(useCase.execute('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });
});
