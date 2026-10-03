import { describe, expect, it } from 'vitest';
import type { RoleName } from '@greynote/contracts';
import type { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { User } from '../../domain/user.entity.js';
import { UpdateUserUseCase } from './updateUser.usecase.js';

const user = (id: string): User => ({
  id,
  employeeCode: id.toUpperCase(),
  name: id,
  email: null,
  phone: null,
  status: 'pending',
  roleId: 'role-field',
  passwordHash: 'x',
  lastLoginAt: null,
  isBlocked: false,
});

const profile = (userId: string, managerId: string | null, extra: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  id: `p-${userId}`,
  userId,
  designationId: null,
  payBandId: null,
  managerId,
  dateOfJoining: null,
  mobileNumber: null,
  guardianName: null,
  dateOfBirth: null,
  address: null,
  qualification: null,
  bankDetails: null,
  documents: [],
  ...extra,
});

/** `chain` maps a user to their manager: `{ a: 'b', b: 'c' }` is a → b → c. */
function build(chain: Record<string, string | null>, extra: Record<string, Partial<EmployeeProfile>> = {}) {
  const ids = new Set([...Object.keys(chain), ...Object.values(chain).filter((v): v is string => v !== null)]);
  const profiles = new Map(Object.entries(chain).map(([id, mgr]) => [id, profile(id, mgr, extra[id])]));
  const writes: Array<{ userId: string; input: Partial<EmployeeProfile> }> = [];
  const revokedAll: Array<{ userId: string; reason: string }> = [];
  const users = new Map([...ids].map((id) => [id, user(id)]));
  const useCase = new UpdateUserUseCase(
    {
      findById: async (id: string) => users.get(id) ?? null,
      update: async (id: string, patch: Partial<User>) => ({ ...(users.get(id) as User), ...patch }),
    } as never,
    { findById: async () => ({ id: 'role-field', name: 'FIELD' as RoleName }) } as never,
    { findById: async (id: string) => (id === 'des-1' ? { id } : null) } as never,
    { findById: async (id: string) => (id === 'band-1' ? { id } : null) } as never,
    {
      findByUserId: async (id: string) => profiles.get(id) ?? null,
      upsert: async (userId: string, input: Partial<EmployeeProfile>) => {
        writes.push({ userId, input });
        const merged = { ...(profiles.get(userId) ?? profile(userId, null)), ...input };
        profiles.set(userId, merged);
        return merged;
      },
    } as never,
    {
      revokeAllForUser: async (userId: string, reason: string) => {
        revokedAll.push({ userId, reason });
      },
    } as never,
  );
  return { useCase, writes, profiles, revokedAll, users };
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected a rejection');
}

describe('UpdateUserUseCase — the manager', () => {
  it('refuses an employee as their own manager', async () => {
    const { useCase, writes } = build({ a: null });
    const error = await rejection(useCase.execute('a', { managerId: 'a' }));
    expect(error).toMatchObject({ statusCode: 400, message: 'An employee cannot report to themselves.' });
    expect(writes).toEqual([]);
  });

  it('refuses two people managing each other', async () => {
    const { useCase, writes } = build({ a: null, b: 'a' }); // b reports to a
    const error = await rejection(useCase.execute('a', { managerId: 'b' }));
    expect(error).toMatchObject({ statusCode: 400, message: expect.stringMatching(/already reports to this employee/) });
    expect(writes).toEqual([]);
  });

  it('refuses a loop through the whole chain', async () => {
    const { useCase } = build({ a: null, b: 'a', c: 'b', d: 'c' }); // d → c → b → a
    await expect(useCase.execute('a', { managerId: 'd' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(useCase.execute('b', { managerId: 'd' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows a manager elsewhere in the tree, including moving up and sideways', async () => {
    const { useCase, writes } = build({ top: null, a: 'top', b: 'top', c: 'a' });
    await useCase.execute('c', { managerId: 'b' }); // sideways
    await useCase.execute('c', { managerId: 'top' }); // up
    expect(writes.map((w) => w.input.managerId)).toEqual(['b', 'top']);
  });

  it('allows the first manager of someone with none', async () => {
    const { useCase, writes } = build({ a: null, b: null });
    await useCase.execute('a', { managerId: 'b' });
    expect(writes).toHaveLength(1);
  });

  it('still reports an unknown manager as such', async () => {
    const { useCase } = build({ a: null });
    await expect(useCase.execute('a', { managerId: 'ghost' })).rejects.toMatchObject({ message: 'Unknown manager.' });
  });

  it('does not hang on a loop that already exists elsewhere in the data', async () => {
    const { useCase, writes } = build({ x: 'y', y: 'x', a: null }); // bad data: x ↔ y
    await useCase.execute('a', { managerId: 'x' });
    expect(writes).toHaveLength(1);
  });

  it('walks the chain it was given and stops at its top', async () => {
    const { useCase } = build({ top: null, a: 'top', b: 'a' });
    await expect(useCase.execute('top', { managerId: 'b' })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('UpdateUserUseCase — clearing an optional field', () => {
  const filled = {
    a: {
      guardianName: 'R. Rao',
      qualification: 'B.Pharm',
      dateOfJoining: new Date('2024-04-01'),
      mobileNumber: '9830012345',
    },
  };

  it('null clears the guardian, the qualification and the joining date', async () => {
    const { useCase, profiles } = build({ a: null }, filled);
    await useCase.execute('a', { basicDetails: { guardianName: null, qualification: null, dateOfJoining: null } });
    expect(profiles.get('a')).toMatchObject({ guardianName: null, qualification: null, dateOfJoining: null });
  });

  it('leaves every other field alone, including the ones not mentioned', async () => {
    const { useCase, profiles } = build({ a: null }, filled);
    await useCase.execute('a', { basicDetails: { guardianName: null } });
    expect(profiles.get('a')).toMatchObject({
      guardianName: null,
      qualification: 'B.Pharm',
      dateOfJoining: new Date('2024-04-01'),
      mobileNumber: '9830012345',
    });
  });

  it('a missing key keeps the stored value, and a new value replaces it', async () => {
    const { useCase, profiles } = build({ a: null }, filled);
    await useCase.execute('a', { basicDetails: { name: 'New Name' } });
    expect(profiles.get('a')).toMatchObject({ guardianName: 'R. Rao', qualification: 'B.Pharm' });
    await useCase.execute('a', { basicDetails: { guardianName: 'S. Rao' } });
    expect(profiles.get('a')).toMatchObject({ guardianName: 'S. Rao' });
  });

  it('clearing optional fields does not change an employee who is otherwise complete', async () => {
    const complete = {
      a: {
        ...filled.a,
        dateOfBirth: new Date('1995-08-20'),
        address: { district: 'D', state: 'S', pincode: '734001', country: 'India' },
        designationId: 'des-1',
        payBandId: 'band-1',
        managerId: 'm',
        bankDetails: { bankName: 'SBI', ifsc: 'SBIN0001234', accountNumber: '123456', accountHolderName: 'A', branchName: null },
      },
    };
    const { useCase } = build({ a: 'm', m: null }, complete);
    const result = await useCase.execute('a', { basicDetails: { guardianName: null, qualification: null, dateOfJoining: null } });
    expect(result.status).toBe('active');
  });
});

describe('UpdateUserUseCase — deactivation', () => {
  it('sets the account inactive and signs the employee out everywhere', async () => {
    const { useCase, revokedAll } = build({ a: null });
    const result = await useCase.execute('a', { status: 'inactive' });
    expect(result.status).toBe('inactive');
    expect(revokedAll).toEqual([{ userId: 'a', reason: 'ADMIN' }]);
  });

  it('does not sign anyone out for an ordinary edit', async () => {
    const { useCase, revokedAll } = build({ a: null });
    await useCase.execute('a', { basicDetails: { name: 'New Name' } });
    expect(revokedAll).toEqual([]);
  });

  it('does not revoke again for an account that is already inactive', async () => {
    const { useCase, revokedAll, users } = build({ a: null });
    users.set('a', { ...(users.get('a') as User), status: 'inactive' });
    await useCase.execute('a', { status: 'inactive' });
    expect(revokedAll).toEqual([]);
  });

  it('keeps an inactive account inactive through a later edit', async () => {
    const { useCase, users } = build({ a: null });
    users.set('a', { ...(users.get('a') as User), status: 'inactive' });
    const result = await useCase.execute('a', { basicDetails: { name: 'Changed' } });
    expect(result.status).toBe('inactive');
  });
});
