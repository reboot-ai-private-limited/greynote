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
  const userHqs = { findActive: async (id: string) => (mainHq[id] ? { hqId: mainHq[id] } : null) } as never;
  const setMainHq = { execute: async (id: string, hqId: string) => void (mainHq[id] = hqId) } as never;
  return {
    coverage,
    mainHq,
    set: new SetManagerCoverageUseCase(coverage, hqRepo, zoneRepo, directory, userHqs, setMainHq),
    get: new GetManagerCoverageUseCase(coverage, userHqs, hqRepo),
    territory: new GetUserTerritoryUseCase(coverage, userHqs, hqRepo),
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

  it('lets an MR cover HQs too, and makes the first one the main HQ when the current one is not among them', async () => {
    const { set, get, mainHq } = setup({ mr: 'hqC' });
    await set.execute('mr', { hqIds: ['hqA', 'hqB'], zoneIds: [] }, 'admin');
    expect((await get.execute('mr')).hqIds).toEqual(['hqA', 'hqB']);
    expect(mainHq['mr']).toBe('hqA');
    expect((await get.execute('mr')).zoneIds).toEqual(['z1']);
    await set.execute('mr', { hqIds: ['hqB', 'hqA'], zoneIds: [] }, 'admin');
    expect(mainHq['mr']).toBe('hqA');
  });

  it('reads an employee with no coverage as covering their single HQ', async () => {
    const { get } = setup({ mr: 'hqA' });
    expect(await get.execute('mr')).toEqual({ userId: 'mr', hqIds: ['hqA'], zoneIds: ['z1'] });
  });

  it('refuses an unknown person, an unknown or inactive HQ, and an unknown zone', async () => {
    const { set } = setup();
    await expect(set.execute('ghost', { hqIds: [], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 404 });
    await expect(set.execute('asm1', { hqIds: ['hqOff'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('asm1', { hqIds: ['nope'], zoneIds: [] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(set.execute('zsm', { hqIds: [], zoneIds: ['zz'] }, 'admin')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('territory for holidays', () => {
  it('a covered Zone brings all its active HQs, a covered HQ brings its Zone, and nothing covered is null', async () => {
    const { set, territory } = setup();
    expect(await territory.execute('nsm')).toBeNull();
    await set.execute('zsm', { hqIds: [], zoneIds: ['z1'] }, 'admin');
    const z = (await territory.execute('zsm'))!;
    expect(z.zoneIds).toEqual(['z1']);
    expect(z.hqIds.sort()).toEqual(['hqA', 'hqB']);
    await set.execute('asm1', { hqIds: ['hqC'], zoneIds: [] }, 'admin');
    expect(await territory.execute('asm1')).toEqual({ hqIds: ['hqC'], zoneIds: ['z2'] });
  });

  it('naming some HQs of a covered Zone narrows it to those', async () => {
    const { set, territory } = setup();
    await set.execute('zsm', { hqIds: ['hqA'], zoneIds: ['z1'] }, 'admin');
    expect((await territory.execute('zsm'))!.hqIds).toEqual(['hqA']);
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

  it('lists managers who cover the employee’s HQ first, those without coverage next, and those whose coverage leaves it out last', async () => {
    const { list, set } = setup();
    await set.execute('asm1', { hqIds: ['hqA', 'hqB'], zoneIds: [] }, 'admin');
    await set.execute('asm2', { hqIds: ['hqC'], zoneIds: [] }, 'admin');
    await set.execute('zsm', { hqIds: [], zoneIds: ['z2'] }, 'admin');
    await set.execute('rsm', { hqIds: ['hqA'], zoneIds: [] }, 'admin');

    const forA = await list.execute({ belowLevel: 1, hqId: 'hqA' });
    // asm1 covers A; asm2 covers only C (missing); asm3 has no coverage yet (flagged); rsm covers A; zsm covers z2 only (missing); nsm covers everywhere.
    expect(forA.map((c) => [c.id, c.coverage])).toEqual([['asm1', 'covers'], ['asm3', 'none'], ['asm2', 'missing'], ['rsm', 'covers'], ['zsm', 'missing'], ['nsm', 'covers']]);
    const forC = await list.execute({ belowLevel: 1, hqId: 'hqC' });
    expect(forC.map((c) => [c.id, c.coverage])).toEqual([['asm2', 'covers'], ['asm3', 'none'], ['asm1', 'missing'], ['rsm', 'missing'], ['zsm', 'covers'], ['nsm', 'covers']]);
  });

  it('searches by name or code', async () => {
    const { list } = setup();
    expect((await list.execute({ belowLevel: 1, search: 'zara' })).map((c) => c.id)).toEqual(['zsm']);
    expect((await list.execute({ belowLevel: 1, search: 'e7' })).map((c) => c.id)).toEqual(['nsm']);
  });
});

describe('extending a manager’s territory', () => {
  function extender(mainHq: Record<string, string> = {}) {
    const base = setup(mainHq);
    const active = new Set<string>();
    const assignments = { findActive: async (routeId: string, userId: string) => (active.has(`${routeId}:${userId}`) ? {} : null) } as never;
    const assignRoute = { execute: async (routeId: string, userId: string) => void active.add(`${routeId}:${userId}`) } as never;
    return { ...base, active, extend: new ExtendManagerTerritoryUseCase(base.get, base.set, hqRepo, assignments, assignRoute, directory) };
  }

  it('adds the HQ, its Zone and the routes for an ASM, and never removes what they had', async () => {
    const { extend, set, get, active } = extender();
    await set.execute('asm1', { hqIds: ['hqC'], zoneIds: [] }, 'admin');
    const out = await extend.execute('asm1', { hqIds: ['hqA'], zoneIds: [], routeIds: ['r1', 'r2'] }, 'admin');
    expect(out).toMatchObject({ hqIds: ['hqC', 'hqA'], zoneIds: ['z2', 'z1'], routesAdded: 2 });
    expect((await get.execute('asm1')).hqIds).toEqual(['hqC', 'hqA']);
    expect([...active].sort()).toEqual(['r1:asm1', 'r2:asm1']);
  });

  it('is idempotent: a second call adds nothing', async () => {
    const { extend } = extender();
    await extend.execute('rsm', { hqIds: ['hqA'], zoneIds: [], routeIds: ['r1'] }, 'admin');
    expect(await extend.execute('rsm', { hqIds: ['hqA'], zoneIds: [], routeIds: ['r1'] }, 'admin')).toMatchObject({ routesAdded: 0 });
  });

  it('gives a ZSM or the NSM the Zone only, with no routes', async () => {
    const { extend, active, get } = extender();
    const z = await extend.execute('zsm', { hqIds: ['hqA'], zoneIds: [], routeIds: ['r1'] }, 'admin');
    expect(z).toEqual({ hqIds: [], zoneIds: ['z1'], routesAdded: 0 });
    const n = await extend.execute('nsm', { hqIds: ['hqC'], zoneIds: [], routeIds: ['r1'] }, 'admin');
    expect(n).toEqual({ hqIds: [], zoneIds: ['z2'], routesAdded: 0 });
    expect((await get.execute('nsm')).zoneIds).toEqual(['z2']);
    expect(active.size).toBe(0);
  });
});
