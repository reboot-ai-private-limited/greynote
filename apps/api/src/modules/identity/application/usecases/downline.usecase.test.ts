import { describe, expect, it } from 'vitest';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { GetDirectReportsUseCase } from './getDirectReports.usecase.js';
import { GetDownlineUseCase } from './getDownline.usecase.js';

/**
 *   nsm
 *   └─ rsm
 *      ├─ asm-b ── mr-z
 *      └─ asm-a ── mr-y, ghost (profile only, no User row)
 */
const TREE: Record<string, string | null> = {
  nsm: null,
  rsm: 'nsm',
  'asm-a': 'rsm',
  'asm-b': 'rsm',
  'mr-y': 'asm-a',
  'mr-z': 'asm-b',
  ghost: 'asm-a',
};
const NAMES: Record<string, string> = { nsm: 'Nanda', rsm: 'Rupa', 'asm-a': 'Zoya', 'asm-b': 'Arun', 'mr-y': 'Yash', 'mr-z': 'Bina' };

const user = (id: string): User =>
  ({ id, employeeCode: id.toUpperCase(), name: NAMES[id], roleId: 'role-field', status: 'active' }) as User;
const profile = (userId: string): EmployeeProfile =>
  ({ id: `p-${userId}`, userId, managerId: TREE[userId], designationId: null }) as EmployeeProfile;

const users = {
  findById: async (id: string) => (NAMES[id] ? user(id) : null),
  findByIds: async (ids: string[]) => ids.filter((id) => NAMES[id]).map(user),
} as unknown as UserRepositoryPort;
const roles = { list: async (): Promise<Role[]> => [{ id: 'role-field', name: 'FIELD' } as Role] } as unknown as RoleRepositoryPort;

/** Walks TREE the way the Mongo adapter's $graphLookup does. */
const profiles = {
  findByUserIds: async (ids: string[]) => ids.filter((id) => id in TREE).map(profile),
  findUserIdsByFilter: async ({ managerId }: { managerId?: string }) =>
    Object.keys(TREE).filter((id) => TREE[id] === managerId),
  findDownline: async (managerId: string) => {
    const out: Array<{ userId: string; managerId: string; depth: number }> = [];
    let frontier = [managerId];
    for (let depth = 1; frontier.length > 0; depth++) {
      const next = Object.keys(TREE).filter((id) => frontier.includes(TREE[id] as string));
      next.forEach((id) => out.push({ userId: id, managerId: TREE[id] as string, depth }));
      frontier = next;
    }
    return out;
  },
} as unknown as EmployeeProfileRepositoryPort;

describe('GetDownlineUseCase', () => {
  const downline = new GetDownlineUseCase(users, roles, profiles);

  it('returns everyone below, sorted by depth then name, with depth 1 for direct reports', async () => {
    const result = await downline.execute('rsm');
    expect(result.map((m) => [m.id, m.depth])).toEqual([
      ['asm-b', 1], // Arun
      ['asm-a', 1], // Zoya
      ['mr-z', 2], // Bina
      ['mr-y', 2], // Yash
    ]);
    expect(result[0]).toMatchObject({ name: 'Arun', role: 'FIELD', managerId: 'rsm' });
  });

  it('skips a profile whose User row no longer exists', async () => {
    const result = await downline.execute('asm-a');
    expect(result.map((m) => m.id)).toEqual(['mr-y']);
  });

  it('is empty for someone with no reports, and 404 for an unknown user', async () => {
    await expect(downline.execute('mr-y')).resolves.toEqual([]);
    await expect(downline.execute('nobody')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('GetDirectReportsUseCase', () => {
  it('returns only depth-1 reports, by name', async () => {
    const result = await new GetDirectReportsUseCase(users, roles, profiles).execute('rsm');
    expect(result.map((u) => u.name)).toEqual(['Arun', 'Zoya']);
  });
});
