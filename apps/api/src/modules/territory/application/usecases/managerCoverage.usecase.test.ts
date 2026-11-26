import { describe, expect, it } from 'vitest';
import type { ManagerCoverage } from '../../domain/managerCoverage.entity.js';
import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import { ExtendManagerTerritoryUseCase } from './extendManagerTerritory.usecase.js';
import { ListManagerCandidatesUseCase } from './listManagerCandidates.usecase.js';
import { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from './managerCoverage.usecase.js';
import { GetUserTerritoryUseCase } from './getUserTerritory.usecase.js';

class FakeCoverage implements ManagerCoverageRepositoryPort {
  rows = new Map<string, ManagerCoverage>();
  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async findMany(userIds: string[]) {
    return userIds.flatMap((id) => (this.rows.has(id) ? [this.rows.get(id)!] : []));
  }
  async save(i: { userId: string; hqIds: string[]; zoneIds: string[]; updatedBy: string }) {
    const row = { ...i, updatedAt: new Date() };
    this.rows.set(i.userId, row);
    return row;
  }
}

const hqs = [
  { id: 'hqA', zoneId: 'z1', name: 'A', status: 'active' as const },
  { id: 'hqB', zoneId: 'z1', name: 'B', status: 'active' as const },
  { id: 'hqC', zoneId: 'z2', name: 'C', status: 'active' as const },
  { id: 'hqOff', zoneId: 'z1', name: 'Off', status: 'inactive' as const },
];
const hqRepo = {
  findById: async (id: string) => hqs.find((h) => h.id === id) ?? null,
  findByIds: async (ids: string[]) => hqs.filter((h) => ids.includes(h.id)),
  list: async (q: { zoneId?: string }) => ({ items: hqs.filter((h) => h.status === 'active' && (!q.zoneId || h.zoneId === q.zoneId)), total: 0 }),
} as never;
const zoneRepo = { findById: async (id: string) => (id === 'z1' || id === 'z2' ? { id, name: id, status: 'active' } : null) } as never;

const people = [
  { id: 'mr', employeeCode: 'E1', name: 'Mira MR', designation: 'MR', designationId: 'dMR', designationLevel: 1, hqId: 'hqA', zoneId: 'z1' },
  { id: 'asm1', employeeCode: 'E2', name: 'Asha ASM', designation: 'ASM', designationId: 'dASM', designationLevel: 2, hqId: 'hqA', zoneId: 'z1' },
  { id: 'asm2', employeeCode: 'E3', name: 'Amit ASM', designation: 'ASM', designationId: 'dASM', designationLevel: 2, hqId: 'hqC', zoneId: 'z2' },
  { id: 'asm3', employeeCode: 'E4', name: 'Anil ASM', designation: 'ASM', designationId: 'dASM', designationLevel: 2, hqId: null, zoneId: null },
  { id: 'rsm', employeeCode: 'E5', name: 'Ravi RSM', designation: 'RSM', designationId: 'dRSM', designationLevel: 3, hqId: 'hqB', zoneId: 'z1' },
  { id: 'zsm', employeeCode: 'E6', name: 'Zara ZSM', designation: 'ZSM', designationId: 'dZSM', designationLevel: 4, hqId: null, zoneId: 'z2' },
  { id: 'nsm', employeeCode: 'E7', name: 'Nina NSM', designation: 'NSM', designationId: 'dNSM', designationLevel: 5, hqId: null, zoneId: null },
];
const directory = {
  findUserSummary: async (id: string) => (people.some((p) => p.id === id) ? { id, employeeCode: '', name: '', role: 'FIELD' as const, status: 'active' as const } : null),
  getDesignationLevels: async (ids: string[]) => people.filter((p) => ids.includes(p.id)).map((p) => ({ userId: p.id, level: p.designationLevel })),
  listFieldEmployees: async () => people,
  recordUserTerritory: async () => {},
} as never;

/** The main HQ each person has; a real set-HQ use case would end and start rows, here it only records the change. */
function setup(mainHq: Record<string, string> = {}) {
  const coverage = new FakeCoverage();
  const userHqs = {
    findActive: async (id: string) => (mainHq[id] ? { userId: id, hqId: mainHq[id] } : null),
    findActiveForUsers: async (ids: string[]) => ids.filter((id) => mainHq[id]).map((id) => ({ userId: id, hqId: mainHq[id] })),
  } as never;
  const setMainHq = { execute: async (id: string, hqId: string) => void (mainHq[id] = hqId) } as never;
  const get = new GetManagerCoverageUseCase(coverage, userHqs, hqRepo);
  return {
    coverage,
    mainHq,
    get,
    set: new SetManagerCoverageUseCase(coverage, hqRepo, zoneRepo, directory, userHqs, setMainHq),
    territory: new GetUserTerritoryUseCase(userHqs, hqRepo),
    list: new ListManagerCandidatesUseCase(directory, userHqs, hqRepo),
    extend: new ExtendManagerTerritoryUseCase(get),
  };
}

describe('one HQ for every designation (2026-11-26)', () => {
  it('sets exactly one HQ, which becomes the main HQ, and the coverage is replaced by it and its Zone', async () => {
    const { set, get, mainHq, coverage } = setup({ zsm: 'hqC' });
    await set.execute('zsm', { hqIds: ['hqA'], zoneIds: ['z2'] }, 'admin');
    expect(mainHq['zsm']).toBe('hqA');
    expect(coverage.rows.get('zsm')).toMatchObject({ hqIds: ['hqA'], zoneIds: ['z1'] });
    expect(await get.execute('zsm')).toEqual({ userId: 'zsm', hqIds: ['hqA'], zoneIds: ['z1'] });
  });

  it('refuses no HQ, several HQs, zones alone, an unknown person and an unknown or inactive HQ', async () => {
    const { set } = setup();
    await expect(set.execute('zsm', { hqIds: [], zoneIds: ['z1'] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('asm1', { hqIds: ['hqA', 'hqB'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('ghost', { hqIds: ['hqA'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 404 });
    await expect(set.execute('asm1', { hqIds: ['hqOff'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('asm1', { hqIds: ['nope'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('reads only the main HQ: an old multi-HQ or Zone coverage is ignored', async () => {
    const { get, coverage } = setup({ rsm: 'hqB' });
    await coverage.save({ userId: 'rsm', hqIds: ['hqA', 'hqC'], zoneIds: ['z2'], updatedBy: 'x' });
    expect(await get.execute('rsm')).toEqual({ userId: 'rsm', hqIds: ['hqB'], zoneIds: ['z1'] });
    expect(await get.execute('nsm')).toEqual({ userId: 'nsm', hqIds: [], zoneIds: [] });
  });

  it('extending a manager changes nothing and answers where they are based', async () => {
    const { extend, mainHq } = setup({ rsm: 'hqB' });
    expect(await extend.execute('rsm', { hqIds: ['hqC'], zoneIds: ['z2'], routeIds: ['r1'] }, 'admin')).toEqual({ hqIds: ['hqB'], zoneIds: ['z1'] });
    expect(mainHq['rsm']).toBe('hqB');
  });
});

describe('territory for holidays', () => {
  it('is the main HQ and its Zone only, whatever coverage is stored; nothing set is null', async () => {
    const { territory, coverage } = setup({ zsm: 'hqA' });
    await coverage.save({ userId: 'zsm', hqIds: [], zoneIds: ['z2'], updatedBy: 'x' });
    expect(await territory.execute('zsm')).toEqual({ hqIds: ['hqA'], zoneIds: ['z1'] });
    expect(await territory.execute('nsm')).toBeNull();
  });
});

describe('manager candidates', () => {
  it('lists only higher designations, nearest level first, never the employee themselves', async () => {
    const { list } = setup();
    const out = await list.execute({ belowLevel: 2 });
    expect(out.map((c) => c.id)).toEqual(['rsm', 'zsm', 'nsm']);
    expect((await list.execute({ belowLevel: 1, excludeUserId: 'asm1' })).map((c) => c.id)).not.toContain('asm1');
    expect((await list.execute({ belowLevel: 1 })).map((c) => c.id)).not.toContain('mr');
  });

  it('hides nobody for where they are based; within a level, those based in the HQ or its Zone come first', async () => {
    const { list } = setup({ asm1: 'hqB', asm2: 'hqC', rsm: 'hqC', zsm: 'hqA' });
    const forA = await list.execute({ belowLevel: 1, hqId: 'hqA' });
    expect(forA.map((c) => [c.id, c.coverage])).toEqual([['asm1', 'covers'], ['asm2', 'none'], ['asm3', 'none'], ['rsm', 'none'], ['zsm', 'covers'], ['nsm', 'none']]);
  });

  it('searches by name or code', async () => {
    const { list } = setup();
    expect((await list.execute({ belowLevel: 1, search: 'zara' })).map((c) => c.id)).toEqual(['zsm']);
    expect((await list.execute({ belowLevel: 1, search: 'e7' })).map((c) => c.id)).toEqual(['nsm']);
  });
});
