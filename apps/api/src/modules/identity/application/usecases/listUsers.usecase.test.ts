import { describe, expect, it } from 'vitest';
import { ListUsersUseCase } from './listUsers.usecase.js';

const user = (id: string, name: string, roleId = 'r-field') => ({
  id, employeeCode: id.toUpperCase(), name, email: null, phone: null, status: 'active' as const, roleId, passwordHash: 'x', lastLoginAt: null, isBlocked: false,
});
const profile = (userId: string, extra: Record<string, unknown>) => ({ id: `p-${userId}`, userId, designationId: 'des-1', managerId: null, hqId: null, zoneId: null, ...extra });

function build(profiles: ReturnType<typeof profile>[]) {
  const users = [user('a', 'Asha'), user('b', 'Bikram'), user('boss', 'Chandan Boss'), user('hr', 'Dipa', 'r-hr')];
  const asked: string[][] = [];
  const useCase = new ListUsersUseCase(
    {
      list: async () => ({ items: users.filter((u) => u.id !== 'boss'), total: 3 }),
      findByIds: async (ids: string[]) => {
        asked.push(ids);
        return users.filter((u) => ids.includes(u.id));
      },
    } as never,
    { findById: async (id: string) => ({ id, name: id === 'r-hr' ? 'HR' : 'FIELD' }) } as never,
    { findByUserIds: async () => profiles } as never,
  );
  return { useCase, asked };
}

const page = { page: 1, pageSize: 25, sortOrder: 'asc' as const };

describe('ListUsersUseCase', () => {
  it('adds the manager name, HQ and zone, asking for the managers in one query', async () => {
    const { useCase, asked } = build([
      profile('a', { managerId: 'boss', hqId: 'hq1', zoneId: 'z1' }),
      profile('b', { managerId: 'boss' }),
    ]);
    const result = await useCase.execute(page, {});
    const byId = Object.fromEntries(result.items.map((i) => [i.id, i]));
    expect(byId['a']).toMatchObject({ managerName: 'Chandan Boss', hqId: 'hq1', zoneId: 'z1' });
    expect(byId['b']).toMatchObject({ managerName: 'Chandan Boss', hqId: null, zoneId: null });
    expect(asked).toEqual([['boss']]);
  });

  it('has no manager name for someone with no manager, no profile, or a manager that no longer exists', async () => {
    const { useCase } = build([profile('a', { managerId: 'ghost' })]);
    const result = await useCase.execute(page, {});
    for (const item of result.items) expect(item).toMatchObject({ managerName: null, hqId: null, zoneId: null });
  });
});
