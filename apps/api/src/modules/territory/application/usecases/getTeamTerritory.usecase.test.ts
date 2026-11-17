import { describe, expect, it } from 'vitest';
import { GetTeamTerritoryUseCase } from './getTeamTerritory.usecase.js';

type P = { id: string; managerId: string | null; hqId: string | null; level: number };
const HQS = [
  { id: 'hqA', zoneId: 'z1', name: 'A', status: 'active' }, { id: 'hqB', zoneId: 'z1', name: 'B', status: 'active' },
  { id: 'hqC', zoneId: 'z2', name: 'C', status: 'active' }, { id: 'hqD', zoneId: 'z2', name: 'D', status: 'inactive' },
];
const ZONES = [{ id: 'z1', name: 'North', status: 'active' }, { id: 'z2', name: 'South', status: 'active' }];

function setup(people: P[], coverage: Record<string, { hqIds: string[]; zoneIds: string[] }> = {}, demo: Set<string> = new Set()) {
  const row = (p: P) => ({ id: p.id, employeeCode: p.id, name: p.id, designation: null, designationId: null, designationLevel: p.level, hqId: p.hqId, zoneId: null, managerId: p.managerId });
  const below = (id: string): P[] => people.filter((p) => p.managerId === id).flatMap((p) => [p, ...below(p.id)]);
  const users = {
    getDownline: async (id: string) => below(id).map((p) => ({ id: p.id })),
    // Like Identity: by id, anyone asked for is answered; without ids it is the all-staff list, which leaves demo accounts out.
    listFieldEmployees: async (onlyIds?: string[]) => people.filter((p) => (onlyIds ? onlyIds.includes(p.id) : !demo.has(p.id))).map(row),
  } as never;
  const cov = { execute: async (id: string) => ({ userId: id, ...(coverage[id] ?? { hqIds: [], zoneIds: [] }) }) } as never;
  const hqs = {
    findByIds: async (ids: string[]) => HQS.filter((h) => ids.includes(h.id)),
    list: async (q: { zoneId?: string }) => ({ items: HQS.filter((h) => h.status === 'active' && (!q.zoneId || h.zoneId === q.zoneId)), total: 0 }),
  } as never;
  const zones = { findById: async (id: string) => ZONES.find((z) => z.id === id) ?? null, list: async () => ({ items: ZONES, total: 2 }) } as never;
  const routes = { list: async (q: { hqId: string }) => ({ items: [{ id: `r-${q.hqId}` }], total: 1 }) } as never;
  return new GetTeamTerritoryUseCase(users, cov, hqs, zones, routes);
}

const company: P[] = [
  { id: 'nsm', managerId: null, hqId: null, level: 5 },
  { id: 'zsm', managerId: 'nsm', hqId: 'hqA', level: 4 },
  { id: 'asm', managerId: 'zsm', hqId: 'hqA', level: 2 },
  { id: 'mr1', managerId: 'asm', hqId: 'hqA', level: 1 },
  { id: 'mr2', managerId: 'asm', hqId: 'hqB', level: 1 },
  { id: 'far', managerId: 'nsm', hqId: 'hqC', level: 1 },
];

describe('a manager’s territory is computed from their team and what they own', () => {
  it('an ASM sees exactly the HQs of the people under them, with how many are in each', async () => {
    const t = await setup(company, { asm: { hqIds: ['hqA'], zoneIds: ['z1'] } }).execute('asm');
    expect(t.zones.map((z) => [z.name, z.hqs.map((h) => [h.name, h.members, h.owned])])).toEqual([['North', [['A', 2, true], ['B', 1, false]]]]);
  });

  it('a ZSM with no HQs named owns every active HQ of their Zone, even one nobody of theirs is in', async () => {
    const t = await setup(company, { zsm: { hqIds: [], zoneIds: ['z1'] } }).execute('zsm');
    expect(t.zones.map((z) => z.name)).toEqual(['North']);
    expect(t.zones[0]!.hqs.map((h) => [h.name, h.owned])).toEqual([['A', true], ['B', true]]);
  });

  it('the NSM with no Zones named owns all of them; an inactive HQ never shows', async () => {
    const t = await setup(company).execute('nsm');
    expect(t.zones.map((z) => [z.name, z.hqs.map((h) => h.name)])).toEqual([['North', ['A', 'B']], ['South', ['C']]]);
  });

  it('a person who left the team no longer counts, and nothing was copied: the view just moves', async () => {
    const moved = company.map((p) => (p.id === 'mr2' ? { ...p, managerId: 'far' } : p));
    const t = await setup(moved, { asm: { hqIds: ['hqA'], zoneIds: ['z1'] } }).execute('asm');
    expect(t.zones[0]!.hqs.map((h) => [h.name, h.members])).toEqual([['A', 2]]);
  });

  it('routes load per HQ, and an HQ outside the manager’s view is refused', async () => {
    const uc = setup(company, { asm: { hqIds: ['hqA'], zoneIds: ['z1'] } });
    expect((await uc.routesInHq('asm', 'hqB', { page: 1, pageSize: 20 })).items).toHaveLength(1);
    await expect(uc.routesInHq('asm', 'hqC', { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('a demo team is counted too (the all-staff list leaves demo accounts out, but a team is asked for by id)', async () => {
    const demoTeam = company.map((p) => ({ ...p }));
    const t = await setup(demoTeam, { asm: { hqIds: ['hqA'], zoneIds: ['z1'] } }, new Set(demoTeam.map((p) => p.id))).execute('asm');
    expect(t.zones[0]!.hqs.map((h) => [h.name, h.members])).toEqual([['A', 2], ['B', 1]]);
    // a ZSM who names no HQ owns every HQ of their Zone, found through their own level, not the all-staff list
    const zsm = await setup(demoTeam, { zsm: { hqIds: [], zoneIds: ['z1'] } }, new Set(demoTeam.map((p) => p.id))).execute('zsm');
    expect(zsm.zones[0]!.hqs.map((h) => [h.name, h.owned])).toEqual([['A', true], ['B', true]]);
  });
});
