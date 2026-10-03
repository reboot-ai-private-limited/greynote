import { beforeEach, describe, expect, it } from 'vitest';
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
  useCase = new ImportHierarchyUseCase(zones, hqs);
});

const ROWS: HierarchyImportRow[] = [
  { line: 2, zone: 'West Bengal', hq: 'SLG-1' },
  { line: 3, zone: 'West Bengal', hq: 'SLG-2' },
  { line: 4, zone: 'west bengal', hq: 'slg-1' },
  { line: 5, zone: 'Sikkim' },
];

describe('ImportHierarchyUseCase', () => {
  it('creates each node once, parents before children, sharing repeated names across rows', async () => {
    const result = await useCase.execute(ROWS, { dryRun: false });
    expect(result.created).toEqual({
      zones: ['West Bengal', 'Sikkim'],
      hqs: ['West Bengal / SLG-1', 'West Bengal / SLG-2'],
    });
    const slg1 = store.hqs.find((h) => h.name === 'SLG-1');
    expect(slg1?.zoneId).toBe(store.zones.find((z) => z.name === 'West Bengal')?.id);
  });

  it('creates HQs without a base place — that needs a map-confirmed pin, set later in the app', async () => {
    await useCase.execute(ROWS, { dryRun: false });
    expect(store.hqs.every((h) => h.basePlace === null)).toBe(true);
  });

  it('writes nothing in a dry run, but reports the same plan', async () => {
    const result = await useCase.execute(ROWS, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.created.hqs).toHaveLength(2);
    expect(store.zones).toHaveLength(0);
  });

  it('is a no-op the second time: everything is reused, nothing duplicated', async () => {
    await useCase.execute(ROWS, { dryRun: false });
    const again = await useCase.execute(ROWS, { dryRun: false });
    expect(again.created).toEqual({ zones: [], hqs: [] });
    expect(again.existing).toEqual({ zones: 2, hqs: 2 });
    expect(store.hqs).toHaveLength(2);
  });

  it('rejects the whole file, listing every problem, when any row names an inactive parent', async () => {
    store.zones.push({ id: 'z-old', name: 'Assam', status: 'inactive' });
    store.zones.push({ id: 'z-bihar', name: 'Bihar', status: 'active' });
    store.hqs.push({ id: 'h-old', zoneId: 'z-bihar', name: 'Patna', basePlace: null, status: 'inactive' });
    const before = store.hqs.length;

    await expect(
      useCase.execute(
        [
          { line: 2, zone: 'Nepal', hq: 'Kathmandu' },
          { line: 3, zone: 'Assam', hq: 'Guwahati' },
          { line: 4, zone: 'Bihar', hq: 'patna' },
        ],
        { dryRun: false },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      publicDetails: {
        errors: [
          { line: 3, message: expect.stringContaining('inactive') },
          { line: 4, message: expect.stringContaining('inactive') },
        ],
      },
    });
    expect(store.zones.some((z) => z.name === 'Nepal')).toBe(false);
    expect(store.hqs).toHaveLength(before);
  });
});
