import { describe, expect, it } from 'vitest';
import type { Designation } from '../../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { ListWorkWithUseCase } from './listWorkWith.usecase.js';

/** mr-1 and mr-2 report to asm-a; asm-a to zsm; asm-b has no reports; old is inactive. */
const MANAGER_OF: Record<string, string | null> = { demo: 'zsm', zsm: null, 'asm-a': 'zsm', 'asm-b': 'zsm', 'mr-1': 'asm-a', 'mr-2': 'asm-a', old: 'zsm' };
const DESIGNATION: Record<string, string | null> = { demo: 'd-mr', zsm: 'd-zsm', 'asm-a': 'd-asm', 'asm-b': 'd-asm', 'mr-1': 'd-mr', 'mr-2': null, old: 'd-asm' };
const NAME: Record<string, string> = { demo: 'Dee', 'demo-boss': 'Dora', zsm: 'Zed', 'asm-a': 'Asha', 'asm-b': 'Bela', 'mr-1': 'Ravi', 'mr-2': 'Mona', old: 'Olga' };

const user = (id: string): User => ({ id, employeeCode: id.toUpperCase(), name: NAME[id], status: id === 'old' ? 'inactive' : 'active', isDemo: id.startsWith('demo') }) as User;

const users = {
  findById: async (id: string) => (NAME[id] ? user(id) : null),
  findByIds: async (ids: string[]) => ids.filter((i) => NAME[i]).map(user),
  listActiveIdsByRole: async (_role: string, opts: { includeDemo?: boolean } = {}) => Object.keys(NAME).filter((i) => i !== 'old' && (opts.includeDemo || !i.startsWith('demo'))),
} as unknown as UserRepositoryPort;
const profiles = {
  findByUserId: async (userId: string) => (userId in MANAGER_OF ? ({ userId, managerId: MANAGER_OF[userId] } as EmployeeProfile) : null),
  findDownline: async (managerId: string) => {
    const out: Array<{ userId: string; managerId: string; depth: number }> = [];
    let level = [managerId];
    for (let depth = 1; level.length > 0; depth++) {
      const next = Object.keys(MANAGER_OF).filter((id) => level.includes(MANAGER_OF[id] as string));
      next.forEach((userId) => out.push({ userId, managerId: MANAGER_OF[userId] as string, depth }));
      level = next;
    }
    return out;
  },
  findByUserIds: async (ids: string[]) => ids.map((userId) => ({ userId, designationId: DESIGNATION[userId] }) as EmployeeProfile),
} as unknown as EmployeeProfileRepositoryPort;
const designations = {
  list: async (): Promise<Designation[]> => [
    { id: 'd-zsm', name: 'ZSM', level: 4 },
    { id: 'd-asm', name: 'ASM', level: 2 },
    { id: 'd-mr', name: 'MR', level: 1 },
  ],
} as unknown as DesignationRepositoryPort;

describe('ListWorkWithUseCase', () => {
  const list = new ListWorkWithUseCase(users, profiles, designations);

  it('gives an MR their whole upline and nobody from another branch', async () => {
    const result = await list.execute('mr-1');
    expect(result.map((p) => p.label)).toEqual(['Asha (ASM)', 'Zed (ZSM)']);
  });

  it('gives a manager their upline and their downline at every depth, not their siblings', async () => {
    expect((await list.execute('asm-a')).map((p) => p.id)).toEqual(['mr-2', 'mr-1', 'zsm']);
    const top = await list.execute('zsm');
    expect(top.map((p) => p.id)).toEqual(['asm-a', 'asm-b', 'mr-2', 'mr-1']);
    expect(top.find((p) => p.id === 'mr-2')?.label).toBe('Mona');
  });

  it('never lists the caller and leaves inactive people out', async () => {
    const ids = (await list.execute('zsm')).map((p) => p.id);
    expect(ids).not.toContain('zsm');
    expect(ids).not.toContain('old');
  });

  it('shows a demo account only to another demo account', async () => {
    expect((await list.execute('zsm')).map((p) => p.id)).not.toContain('demo');
    expect((await list.execute('demo-boss')).map((p) => p.id)).toEqual([]);
  });

  it('the directory still lists every active field employee', async () => {
    expect((await list.executeDirectory()).map((p) => p.label)).toEqual(['Asha (ASM)', 'Bela (ASM)', 'Mona', 'Ravi (MR)', 'Zed (ZSM)']);
  });
});
