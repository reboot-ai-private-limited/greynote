import { describe, expect, it } from 'vitest';
import type { Designation } from '../../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { ListWorkWithUseCase } from './listWorkWith.usecase.js';

/** mr-1 and mr-2 report to asm-a; asm-a to zsm; asm-b has no reports; old is inactive. */
const MANAGER_OF: Record<string, string | null> = { zsm: null, 'asm-a': 'zsm', 'asm-b': 'zsm', 'mr-1': 'asm-a', 'mr-2': 'asm-a', old: 'zsm' };
const DESIGNATION: Record<string, string | null> = { zsm: 'd-zsm', 'asm-a': 'd-asm', 'asm-b': 'd-asm', 'mr-1': 'd-mr', 'mr-2': null, old: 'd-asm' };
const NAME: Record<string, string> = { zsm: 'Zed', 'asm-a': 'Asha', 'asm-b': 'Bela', 'mr-1': 'Ravi', 'mr-2': 'Mona', old: 'Olga' };

const user = (id: string): User => ({ id, employeeCode: id.toUpperCase(), name: NAME[id], status: id === 'old' ? 'inactive' : 'active' }) as User;

const users = {
  findByIds: async (ids: string[]) => ids.filter((i) => NAME[i]).map(user),
  listActiveIdsByRole: async () => Object.keys(NAME).filter((i) => i !== 'old'),
} as unknown as UserRepositoryPort;
const profiles = {
  findManagerIds: async () => [...new Set(Object.values(MANAGER_OF).filter((m): m is string => m !== null))],
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

  it('lists every manager in the org — not only the caller’s own chain — with the designation in the label', async () => {
    const result = await list.execute('mr-1');
    expect(result.map((p) => p.label)).toEqual(['Asha (ASM)', 'Zed (ZSM)']);
  });

  it('never lists the caller, even a manager', async () => {
    expect((await list.execute('asm-a')).map((p) => p.id)).toEqual(['zsm']);
  });

  it('leaves inactive people out', async () => {
    expect((await list.execute('mr-1')).map((p) => p.id)).not.toContain('old');
  });

  it('scope=all lists every active field employee; a person with no designation is just the name', async () => {
    const result = await list.execute('zsm', 'all');
    expect(result.map((p) => p.label)).toEqual(['Asha (ASM)', 'Bela (ASM)', 'Mona', 'Ravi (MR)']);
    expect(result.find((p) => p.id === 'mr-2')?.designation).toBeNull();
  });
});
