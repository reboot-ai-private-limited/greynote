import { describe, expect, it } from 'vitest';
import { GetTerritoryGapsUseCase } from './getTerritoryGaps.usecase.js';

const hqs = [
  { id: 'hqA', zoneId: 'z1', status: 'active' },
  { id: 'hqB', zoneId: 'z1', status: 'active' },
  { id: 'hqC', zoneId: 'z2', status: 'active' },
];
const person = (id: string, designationLevel: number, managerId: string | null) => ({
  id,
  employeeCode: id,
  name: id,
  designation: ['', 'MR', 'ASM', 'RSM', 'ZSM', 'NSM'][designationLevel] ?? null,
  designationId: null,
  designationLevel,
  hqId: null,
  zoneId: null,
  managerId,
});

function setup(coverage: Record<string, { hqIds: string[]; zoneIds: string[] }>, routes: Record<string, string[]>) {
  const people = [person('mr', 1, 'asm'), person('mr2', 1, 'asm'), person('asm', 2, 'zsm'), person('zsm', 4, 'nsm'), person('nsm', 5, null), person('lone', 2, null)];
  const users = { listFieldEmployees: async () => people } as never;
  const cov = { execute: async (userId: string) => ({ userId, ...(coverage[userId] ?? { hqIds: [], zoneIds: [] }) }) } as never;
  const assignments = { listActiveForUser: async (userId: string) => (routes[userId] ?? []).map((routeId) => ({ routeId })) } as never;
  const routeRepo = { findByIds: async (ids: string[]) => ids.map((id) => ({ id, status: 'active' })) } as never;
  const hqRepo = { findByIds: async (ids: string[]) => hqs.filter((h) => ids.includes(h.id)) } as never;
  return new GetTerritoryGapsUseCase(users, cov, assignments, routeRepo, hqRepo);
}

describe('territory gaps', () => {
  it('lists what an ASM’s MRs have that the ASM does not: HQ, Zone and routes', async () => {
    const gaps = setup({ mr: { hqIds: ['hqA'], zoneIds: ['z1'] }, mr2: { hqIds: ['hqC'], zoneIds: ['z2'] }, asm: { hqIds: ['hqA'], zoneIds: ['z1'] } }, { mr: ['r1', 'r2'], mr2: ['r3'], asm: ['r1'] });
    const asm = (await gaps.all()).find((g) => g.managerId === 'asm')!;
    expect(asm).toMatchObject({ hqIds: ['hqC'], zoneIds: ['z2'], routeIds: ['r2', 'r3'], reports: 2 });
  });

  it('leaves out a manager with nothing missing, or no reports', async () => {
    const gaps = setup({ mr: { hqIds: ['hqA'], zoneIds: ['z1'] }, asm: { hqIds: ['hqA'], zoneIds: ['z1'] } }, { mr: ['r1'], asm: ['r1'] });
    const out = await gaps.all();
    expect(out.map((g) => g.managerId)).not.toContain('asm');
    expect(out.map((g) => g.managerId)).not.toContain('lone');
  });

  it('counts an HQ as covered through a Zone the manager does not narrow, and not through one they do', async () => {
    const wide = setup({ mr: { hqIds: ['hqB'], zoneIds: ['z1'] }, asm: { hqIds: [], zoneIds: ['z1'] } }, {});
    expect((await wide.forManager('asm'))!.hqIds).toEqual([]);
    const narrow = setup({ mr: { hqIds: ['hqB'], zoneIds: ['z1'] }, asm: { hqIds: ['hqA'], zoneIds: ['z1'] } }, {});
    expect((await narrow.forManager('asm'))!.hqIds).toEqual(['hqB']);
  });

  it('gives a ZSM and the NSM Zones only: no routes, and HQs only when they already narrow', async () => {
    const gaps = setup({ asm: { hqIds: ['hqA'], zoneIds: ['z1'] }, zsm: { hqIds: [], zoneIds: ['z2'] }, nsm: { hqIds: [], zoneIds: [] } }, { asm: ['r1'], zsm: ['r9'] });
    const zsm = (await gaps.forManager('zsm'))!;
    expect(zsm).toMatchObject({ hqIds: [], zoneIds: ['z1'], routeIds: [] });
    const nsm = (await gaps.forManager('nsm'))!;
    expect(nsm).toMatchObject({ hqIds: [], zoneIds: ['z2'], routeIds: [] });
  });
});
