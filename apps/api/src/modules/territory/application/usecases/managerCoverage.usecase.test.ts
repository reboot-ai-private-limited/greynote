import { describe, expect, it } from 'vitest';
import type { ManagerCoverage } from '../../domain/managerCoverage.entity.js';
import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import { ListManagerCandidatesUseCase } from './listManagerCandidates.usecase.js';
import { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from './managerCoverage.usecase.js';

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
const hqRepo = { findById: async (id: string) => hqs.find((h) => h.id === id) ?? null, findByIds: async (ids: string[]) => hqs.filter((h) => ids.includes(h.id)) } as never;
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

function setup() {
  const coverage = new FakeCoverage();
  return {
    coverage,
    set: new SetManagerCoverageUseCase(coverage, hqRepo, zoneRepo, directory),
    get: new GetManagerCoverageUseCase(coverage),
    list: new ListManagerCandidatesUseCase(directory, coverage, hqRepo),
  };
}

describe('manager coverage', () => {
  it('saves HQs for an ASM and zones for a ZSM, replacing the list whole; reads back empty when none', async () => {
    const { set, get } = setup();
    expect(await get.execute('asm1')).toEqual({ userId: 'asm1', hqIds: [], zoneIds: [] });
    await set.execute('asm1', { hqIds: ['hqA', 'hqB', 'hqA'], zoneIds: [] }, 'admin');
    expect((await get.execute('asm1')).hqIds).toEqual(['hqA', 'hqB']);
    await set.execute('asm1', { hqIds: ['hqC'], zoneIds: [] }, 'admin');
    expect((await get.execute('asm1')).hqIds).toEqual(['hqC']);
    await set.execute('zsm', { hqIds: [], zoneIds: ['z2'] }, 'admin');
    expect((await get.execute('zsm')).zoneIds).toEqual(['z2']);
  });

  it('refuses an MR, an unknown person, an unknown or inactive HQ, and an unknown zone', async () => {
    const { set } = setup();
    await expect(set.execute('mr', { hqIds: ['hqA'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('ghost', { hqIds: [], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 404 });
    await expect(set.execute('asm1', { hqIds: ['hqOff'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('asm1', { hqIds: ['nope'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('zsm', { hqIds: [], zoneIds: ['zz'] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
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

  it('keeps managers whose HQ coverage or zone coverage includes the employee’s HQ, drops the rest, flags those without coverage', async () => {
    const { list, set } = setup();
    await set.execute('asm1', { hqIds: ['hqA', 'hqB'], zoneIds: [] }, 'admin');
    await set.execute('asm2', { hqIds: ['hqC'], zoneIds: [] }, 'admin');
    await set.execute('zsm', { hqIds: [], zoneIds: ['z2'] }, 'admin');
    await set.execute('rsm', { hqIds: ['hqA'], zoneIds: [] }, 'admin');

    const forA = await list.execute({ belowLevel: 1, hqId: 'hqA' });
    // asm1 covers A; asm2 covers only C; asm3 has no coverage yet (listed, flagged); rsm covers A; zsm covers z2 only; nsm covers everywhere.
    expect(forA.map((c) => [c.id, c.coverage])).toEqual([['asm1', 'covers'], ['asm3', 'none'], ['rsm', 'covers'], ['nsm', 'covers']]);
    const forC = await list.execute({ belowLevel: 1, hqId: 'hqC' });
    expect(forC.map((c) => c.id)).toEqual(['asm2', 'asm3', 'zsm', 'nsm']);
  });

  it('searches by name or code', async () => {
    const { list } = setup();
    expect((await list.execute({ belowLevel: 1, search: 'zara' })).map((c) => c.id)).toEqual(['zsm']);
    expect((await list.execute({ belowLevel: 1, search: 'e7' })).map((c) => c.id)).toEqual(['nsm']);
  });
});
