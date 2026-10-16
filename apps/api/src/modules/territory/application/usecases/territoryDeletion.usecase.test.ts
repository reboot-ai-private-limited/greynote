import { describe, expect, it } from 'vitest';
import type { DeletionScope } from '../../domain/territoryDeletion.js';
import { TerritoryDeletionUseCase } from './territoryDeletion.usecase.js';

const zoneScope: DeletionScope = {
  kind: 'ZONE',
  id: 'z1',
  name: 'ASSAM',
  zones: [{ id: 'z1', name: 'ASSAM' }],
  hqs: [
    { id: 'h1', name: 'GUWAHATI', zoneId: 'z1', zoneName: 'ASSAM' },
    { id: 'h2', name: 'NAGAON', zoneId: 'z1', zoneName: 'ASSAM' },
  ],
  routes: [1, 2, 3].map((n) => ({
    id: `r${n}`,
    name: `GUWAHATI to R${n}`,
    hqId: 'h1',
    hqName: 'GUWAHATI',
    zoneId: 'z1',
    zoneName: 'ASSAM',
    type: 'HQ' as const,
    destinationName: `R${n}`,
    distanceKm: '10',
    taPerKmRateOverridePaise: null,
  })),
};

function build() {
  const removed: Array<{ scope: DeletionScope; actor: string }> = [];
  const store = {
    resolve: async (kind: string, id: string) => (kind === 'ZONE' && id === 'z1' ? zoneScope : null),
    countPeople: async () => ({ total: 5, routes: 3, hq: 2, coverage: 1 }),
    remove: async (scope: DeletionScope, actor: string) => void removed.push({ scope, actor }),
  } as never;
  return { useCase: new TerritoryDeletionUseCase(store), removed };
}

describe('TerritoryDeletionUseCase', () => {
  it('reports what a zone delete would also take, the people touched and the records that point at it', async () => {
    const { useCase } = build();
    useCase.bindReferenceCounter(async (scope) => ({ doctors: scope.routeIds.length * 10, chemists: 2, distributors: 1, holidays: 4, plannedDays: 7 }));
    const impact = await useCase.impact('ZONE', 'z1');
    expect(impact.alsoDeleted).toEqual({ zones: 0, hqs: 2, routes: 3 });
    expect(impact.alsoDeletedNames).toEqual(['GUWAHATI', 'NAGAON', 'GUWAHATI to R1', 'GUWAHATI to R2', 'GUWAHATI to R3']);
    expect(impact.people).toEqual({ total: 5, routes: 3, hq: 2, coverage: 1 });
    expect(impact.references).toEqual({ doctors: 30, chemists: 2, distributors: 1, holidays: 4, plannedDays: 7 });
  });

  it('counts no references until a counter is bound', async () => {
    const { useCase } = build();
    expect((await useCase.impact('ZONE', 'z1')).references).toEqual({ doctors: 0, chemists: 0, distributors: 0, holidays: 0, plannedDays: 0 });
  });

  it('deletes the whole scope and says how much went', async () => {
    const { useCase, removed } = build();
    expect(await useCase.delete('ZONE', 'z1', 'admin')).toEqual({ deleted: { zones: 1, hqs: 2, routes: 3 } });
    expect(removed).toHaveLength(1);
    expect(removed[0]?.actor).toBe('admin');
  });

  it('refuses an unknown item', async () => {
    const { useCase } = build();
    await expect(useCase.impact('ZONE', 'nope')).rejects.toMatchObject({ statusCode: 404 });
    await expect(useCase.delete('HQ', 'h1', 'admin')).rejects.toMatchObject({ statusCode: 404 });
  });
});
