import { beforeEach, describe, expect, it } from 'vitest';
import type { Area } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { HierarchyImportRow } from '../../domain/hierarchyImport.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Zone } from '../../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { ImportHierarchyUseCase } from './importHierarchy.usecase.js';

/** Minimal in-memory store covering just what the import touches. */
class Store {
  zones: Zone[] = [];
  hqs: Hq[] = [];
  areas: Area[] = [];
  private n = 0;
  id = () => `id-${++this.n}`;
}

let store: Store;
let useCase: ImportHierarchyUseCase;
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

beforeEach(() => {
  store = new Store();
  const zones = {
    findByName: async (name: string) => store.zones.find((z) => eq(z.name, name)) ?? null,
    create: async (input: Omit<Zone, 'id'>) => {
      const row = { ...input, id: store.id() };
      store.zones.push(row);
      return row;
    },
  } as unknown as ZoneRepositoryPort;
  const hqs = {
    findByName: async (zoneId: string, name: string) =>
      store.hqs.find((h) => h.zoneId === zoneId && eq(h.name, name)) ?? null,
    create: async (input: Omit<Hq, 'id'>) => {
      const row = { ...input, id: store.id() };
      store.hqs.push(row);
      return row;
    },
  } as unknown as HqRepositoryPort;
  const areas = {
    findByName: async (hqId: string, name: string) =>
      store.areas.find((a) => a.hqId === hqId && eq(a.name, name)) ?? null,
    create: async (input: Omit<Area, 'id'>) => {
      const row = { ...input, id: store.id() };
      store.areas.push(row);
      return row;
    },
  } as unknown as AreaRepositoryPort;
  useCase = new ImportHierarchyUseCase(zones, hqs, areas);
});

const ROWS: HierarchyImportRow[] = [
  { line: 2, zone: 'West Bengal', hq: 'Siliguri', area: { name: 'Matigara', type: 'HQ' } },
  { line: 3, zone: 'West Bengal', hq: 'Siliguri', area: { name: 'Sevoke', type: 'OUT_STATION' } },
  { line: 4, zone: 'west bengal', hq: 'Jalpaiguri' },
  { line: 5, zone: 'Sikkim' },
];

describe('ImportHierarchyUseCase', () => {
  it('creates each node once, parents before children, sharing repeated names across rows', async () => {
    const result = await useCase.execute(ROWS, { dryRun: false });
    expect(result.created).toEqual({
      zones: ['West Bengal', 'Sikkim'],
      hqs: ['West Bengal / Siliguri', 'West Bengal / Jalpaiguri'],
      areas: ['West Bengal / Siliguri / Matigara', 'West Bengal / Siliguri / Sevoke'],
    });
    const siliguri = store.hqs.find((h) => h.name === 'Siliguri');
    expect(siliguri?.zoneId).toBe(store.zones.find((z) => z.name === 'West Bengal')?.id);
    expect(store.areas.every((a) => a.hqId === siliguri?.id)).toBe(true);
  });

  it('writes nothing in a dry run, but reports the same plan', async () => {
    const result = await useCase.execute(ROWS, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.created.areas).toHaveLength(2);
    expect(store.zones).toHaveLength(0);
  });

  it('is a no-op the second time: everything is reused, nothing duplicated', async () => {
    await useCase.execute(ROWS, { dryRun: false });
    const again = await useCase.execute(ROWS, { dryRun: false });
    expect(again.created).toEqual({ zones: [], hqs: [], areas: [] });
    expect(again.existing).toEqual({ zones: 2, hqs: 2, areas: 2 });
    expect(store.areas).toHaveLength(2);
  });

  it('rejects the whole file, listing every problem, when any row conflicts', async () => {
    store.zones.push({ id: 'z-old', name: 'Assam', status: 'inactive' });
    await useCase.execute([ROWS[0] as HierarchyImportRow], { dryRun: false });
    const before = store.areas.length;

    await expect(
      useCase.execute(
        [
          { line: 2, zone: 'Bihar', hq: 'Patna' },
          { line: 3, zone: 'Assam', hq: 'Guwahati' },
          { line: 4, zone: 'West Bengal', hq: 'Siliguri', area: { name: 'MATIGARA', type: 'EX_STATION' } },
          { line: 5, zone: 'Bihar', hq: 'Patna', area: { name: 'Danapur', type: 'HQ' } },
          { line: 6, zone: 'Bihar', hq: 'Patna', area: { name: 'danapur', type: 'OUT_STATION' } },
        ],
        { dryRun: false },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      publicDetails: {
        errors: [
          { line: 3, message: expect.stringContaining('inactive') },
          { line: 4, message: expect.stringContaining('already exists as HQ') },
          { line: 6, message: expect.stringContaining('earlier in the file') },
        ],
      },
    });
    expect(store.zones.some((z) => z.name === 'Bihar')).toBe(false);
    expect(store.areas).toHaveLength(before);
  });
});
