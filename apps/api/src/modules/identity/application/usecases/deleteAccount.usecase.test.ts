import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../domain/user.entity.js';
import { DELETED_NAME, DeleteAccountUseCase } from './deleteAccount.usecase.js';

const USER: User = {
  id: 'u1',
  employeeCode: 'MR001',
  name: 'Jane MR',
  email: 'j@x.com',
  phone: '999',
  status: 'active',
  roleId: 'role-field',
  passwordHash: 'hash',
  lastLoginAt: null,
  isBlocked: false,
};

function setup(opts: { role?: string; reports?: User[]; user?: User; passwordOk?: boolean } = {}) {
  const user = opts.user ?? USER;
  const users = {
    findById: vi.fn(async () => user),
    findByIds: vi.fn(async () => opts.reports ?? []),
    update: vi.fn(async () => user),
  };
  const roles = { findById: vi.fn(async () => ({ id: 'r', name: opts.role ?? 'FIELD' })) };
  const profiles = {
    findByUserId: vi.fn(async () => ({ documents: [{ publicId: 'pub1' }] })),
    findDownline: vi.fn(async () => (opts.reports ?? []).map((r) => ({ userId: r.id, managerId: 'u1', depth: 1 }))),
    upsert: vi.fn(async () => ({})),
  };
  const sessions = { revokeAllForUser: vi.fn(async () => undefined) };
  const devices = {
    listForUser: vi.fn(async () => [
      { id: 'd1', status: 'REGISTERED' },
      { id: 'd2', status: 'REJECTED' },
    ]),
    setStatus: vi.fn(async () => ({})),
  };
  const hasher = { hash: vi.fn(async () => 'newhash'), verify: vi.fn(async () => opts.passwordOk ?? true) };
  const storage = { remove: vi.fn(async () => undefined) };
  const useCase = new DeleteAccountUseCase(
    users as never, roles as never, profiles as never, sessions as never, devices as never, hasher as never, storage as never,
  );
  return { useCase, users, profiles, sessions, devices, storage };
}

describe('DeleteAccountUseCase', () => {
  it('scrubs personal data, closes the account and ends sessions and devices', async () => {
    const t = setup();
    await t.useCase.deleteOwn('u1', 'secret123');
    expect(t.storage.remove).toHaveBeenCalledWith('pub1');
    expect(t.profiles.upsert).toHaveBeenCalledWith('u1', expect.objectContaining({ bankDetails: null, documents: [], address: null }));
    expect(t.users.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ status: 'inactive', name: DELETED_NAME, email: null, phone: null, passwordHash: 'newhash' }),
    );
    expect(t.sessions.revokeAllForUser).toHaveBeenCalledWith('u1', 'ADMIN');
    expect(t.devices.setStatus).toHaveBeenCalledTimes(1);
  });

  it('refuses a wrong password and changes nothing', async () => {
    const t = setup({ passwordOk: false });
    await expect(t.useCase.deleteOwn('u1', 'nope-nope')).rejects.toMatchObject({ statusCode: 403 });
    expect(t.users.update).not.toHaveBeenCalled();
  });

  it('refuses non-FIELD accounts', async () => {
    const t = setup({ role: 'ADMIN' });
    await expect(t.useCase.anonymise('u1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a manager with active reports, but not one whose reports have all left', async () => {
    const active = setup({ reports: [{ ...USER, id: 'u2' }] });
    await expect(active.useCase.anonymise('u1')).rejects.toMatchObject({ statusCode: 409 });
    const left = setup({ reports: [{ ...USER, id: 'u2', status: 'inactive' }] });
    await expect(left.useCase.anonymise('u1')).resolves.toBeUndefined();
  });

  it('refuses an account that is already deleted', async () => {
    const t = setup({ user: { ...USER, deletedAt: new Date() } });
    await expect(t.useCase.anonymise('u1')).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('deleteByCredentials (public page)', () => {
    function withLookup(t: ReturnType<typeof setup>, found: User | null) {
      (t.users as unknown as { findByEmployeeCode: unknown }).findByEmployeeCode = vi.fn(async () => found);
    }

    it('deletes with the right code and password', async () => {
      const t = setup();
      withLookup(t, USER);
      await t.useCase.deleteByCredentials('MR001', 'secret123');
      expect(t.users.update).toHaveBeenCalledWith('u1', expect.objectContaining({ status: 'inactive', name: DELETED_NAME }));
      expect(t.sessions.revokeAllForUser).toHaveBeenCalledWith('u1', 'ADMIN');
    });

    it('gives the same 401 for an unknown code and a wrong password, and changes nothing', async () => {
      const unknown = setup();
      withLookup(unknown, null);
      await expect(unknown.useCase.deleteByCredentials('NOPE', 'x')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid employee code or password.',
      });
      const wrong = setup({ passwordOk: false });
      withLookup(wrong, USER);
      await expect(wrong.useCase.deleteByCredentials('MR001', 'x')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid employee code or password.',
      });
      expect(wrong.users.update).not.toHaveBeenCalled();
    });

    it('refuses office roles, the demo account and an already-deleted account', async () => {
      const admin = setup({ role: 'ADMIN' });
      withLookup(admin, USER);
      await expect(admin.useCase.deleteByCredentials('MR001', 'x')).rejects.toMatchObject({ statusCode: 400 });
      const demoUser = { ...USER, isDemo: true };
      const demo = setup({ user: demoUser });
      withLookup(demo, demoUser);
      await expect(demo.useCase.deleteByCredentials('MR001', 'x')).rejects.toMatchObject({ statusCode: 403 });
      const goneUser = { ...USER, deletedAt: new Date() };
      const gone = setup({ user: goneUser });
      withLookup(gone, goneUser);
      await expect(gone.useCase.deleteByCredentials('MR001', 'x')).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
