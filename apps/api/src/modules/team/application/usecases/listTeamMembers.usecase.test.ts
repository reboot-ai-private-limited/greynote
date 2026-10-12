import { describe, expect, it } from 'vitest';
import type { DownlineEntry, TeamDirectoryPort, TeamTerritoryPort } from '../../domain/ports.js';
import { ListTeamMembersUseCase } from './listTeamMembers.usecase.js';

const person = (
  id: string,
  depth: number,
  managerId: string,
  status: DownlineEntry['status'] = 'active',
): DownlineEntry => ({
  id,
  employeeCode: id.toUpperCase(),
  name: `Person ${id}`,
  managerId,
  status,
  depth,
});

const directory: TeamDirectoryPort = {
  // The RSM's team: two ASMs (depth 1), their MRs (depth 2), one of whom has left.
  getDownline: async (managerId) =>
    managerId === 'rsm'
      ? [
          person('asm1', 1, 'rsm'),
          person('asm2', 1, 'rsm'),
          person('mr1', 2, 'asm1'),
          person('mr2', 2, 'asm1', 'inactive'),
        ]
      : [],
  listFieldEmployees: async (ids) =>
    (ids ?? []).map((id) => ({
      id,
      designation: id.startsWith('asm') ? 'ASM' : 'MR',
      hqId: 'hq1',
      zoneId: 'z1',
    })),
};
const territory: TeamTerritoryPort = {
  getHq: async (id) => (id === 'hq1' ? { id, name: 'Pune' } : null),
  getZone: async (id) => (id === 'z1' ? { id, name: 'West' } : null),
};
const useCase = new ListTeamMembersUseCase(directory, territory);
const base = { scope: 'all', status: 'active', page: 1, pageSize: 50 } as const;

describe('ListTeamMembers', () => {
  it('lists the downline nearest first, active only, with designation, HQ and zone', async () => {
    const page = await useCase.execute('rsm', base);
    expect(page.items.map((m) => m.id)).toEqual(['asm1', 'asm2', 'mr1']);
    expect(page.items[0]).toMatchObject({
      designation: 'ASM',
      depth: 1,
      hq: { name: 'Pune' },
      zone: { name: 'West' },
    });
  });

  it('marks who has a team of their own', async () => {
    const page = await useCase.execute('rsm', base);
    expect(page.items.map((m) => m.isManager)).toEqual([true, false, false]);
  });

  it('narrows to direct reports or to deeper levels', async () => {
    expect(
      (await useCase.execute('rsm', { ...base, scope: 'direct' })).items.map((m) => m.id),
    ).toEqual(['asm1', 'asm2']);
    expect(
      (await useCase.execute('rsm', { ...base, scope: 'indirect' })).items.map((m) => m.id),
    ).toEqual(['mr1']);
  });

  it('shows people who left only when asked', async () => {
    expect(
      (await useCase.execute('rsm', { ...base, status: 'all' })).items.map((m) => m.id),
    ).toContain('mr2');
  });

  it('searches by name or employee code', async () => {
    expect(
      (await useCase.execute('rsm', { ...base, search: 'MR1' })).items.map((m) => m.id),
    ).toEqual(['mr1']);
    expect(
      (await useCase.execute('rsm', { ...base, search: 'person asm' })).items.map((m) => m.id),
    ).toEqual(['asm1', 'asm2']);
  });

  it('pages, with the total of everything that matched', async () => {
    const page = await useCase.execute('rsm', { ...base, pageSize: 2, page: 2 });
    expect(page).toMatchObject({ total: 3, totalPages: 2 });
    expect(page.items.map((m) => m.id)).toEqual(['mr1']);
  });

  it('is empty for someone with no team, and never shows anyone else’s people', async () => {
    expect((await useCase.execute('mr1', base)).items).toEqual([]);
  });
});
