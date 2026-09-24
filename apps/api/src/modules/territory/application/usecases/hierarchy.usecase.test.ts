import { beforeEach, describe, expect, it } from 'vitest';
import type { Area } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { Zone } from '../../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { CreateAreaUseCase } from './createArea.usecase.js';
import { CreateHqUseCase } from './createHq.usecase.js';
import { CreateZoneUseCase } from './createZone.usecase.js';
import { UpdateAreaUseCase } from './updateArea.usecase.js';
import { UpdateHqUseCase } from './updateHq.usecase.js';
import { UpdateZoneUseCase } from './updateZone.usecase.js';

/** In-memory rows; `findByName` is case-insensitive within a parent, like the real unique index. */
class FakeTable<T extends { id: string; name: string; status: string }> {
  rows = new Map<string, T>();
  private nextId = 1;
  constructor(private readonly parentKey?: keyof T) {}

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  findIn(parentId: string | undefined, name: string) {
    const match = [...this.rows.values()].find(
      (r) =>
        r.name.toLowerCase() === name.toLowerCase() &&
        (this.parentKey === undefined || r[this.parentKey] === parentId),
    );
    return match ?? null;
  }
  countActiveIn(parentId: string) {
    return [...this.rows.values()].filter((r) => this.parentKey && r[this.parentKey] === parentId && r.status === 'active')
      .length;
  }
  async list(): Promise<{ items: T[]; total: number }> {
    throw new Error('not used');
  }
  async create(input: Omit<T, 'id'>) {
    const row = { ...input, id: `id-${this.nextId++}` } as T;
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, input: Partial<T>) {
    const row = { ...(this.rows.get(id) as T), ...input };
    this.rows.set(id, row);
    return row;
  }
}

class FakeZones extends FakeTable<Zone> implements ZoneRepositoryPort {
  async findByName(name: string) {
    return this.findIn(undefined, name);
  }
}
class FakeHqs extends FakeTable<Hq> implements HqRepositoryPort {
  constructor() {
    super('zoneId');
  }
  async findByName(zoneId: string, name: string) {
    return this.findIn(zoneId, name);
  }
  async countActiveInZone(zoneId: string) {
    return this.countActiveIn(zoneId);
  }
}
class FakeAreas extends FakeTable<Area> implements AreaRepositoryPort {
  constructor() {
    super('hqId');
  }
  async findByName(hqId: string, name: string) {
    return this.findIn(hqId, name);
  }
  async countActiveInHq(hqId: string) {
    return this.countActiveIn(hqId);
  }
}

/** Areas here never have routes; route-dependent rules are in route.usecase.test.ts. */
const noRoutes = { countActiveInArea: async () => 0 } as unknown as RouteRepositoryPort;

let zones: FakeZones;
let hqs: FakeHqs;
let areas: FakeAreas;

beforeEach(() => {
  zones = new FakeZones();
  hqs = new FakeHqs();
  areas = new FakeAreas();
});

async function seedChain() {
  const zone = await new CreateZoneUseCase(zones).execute({ name: 'West Bengal' });
  const hq = await new CreateHqUseCase(hqs, zones).execute({ zoneId: zone.id, name: 'Siliguri' });
  const area = await new CreateAreaUseCase(areas, hqs).execute({ hqId: hq.id, name: 'Matigara', type: 'HQ' });
  return { zone, hq, area };
}

describe('names', () => {
  it('rejects a Zone name that differs only in case', async () => {
    await new CreateZoneUseCase(zones).execute({ name: 'West Bengal' });
    await expect(new CreateZoneUseCase(zones).execute({ name: 'west bengal' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { field: 'name' },
    });
  });

  it('allows the same HQ name in two different Zones', async () => {
    const a = await new CreateZoneUseCase(zones).execute({ name: 'A' });
    const b = await new CreateZoneUseCase(zones).execute({ name: 'B' });
    await new CreateHqUseCase(hqs, zones).execute({ zoneId: a.id, name: 'Central' });
    await expect(new CreateHqUseCase(hqs, zones).execute({ zoneId: b.id, name: 'Central' })).resolves.toMatchObject({
      zoneId: b.id,
    });
  });

  it('rejects renaming an Area onto a sibling name, but allows re-saving its own name', async () => {
    const { hq, area } = await seedChain();
    await new CreateAreaUseCase(areas, hqs).execute({ hqId: hq.id, name: 'Fulbari', type: 'EX_STATION' });
    const update = new UpdateAreaUseCase(areas, hqs, noRoutes);

    await expect(update.execute(area.id, { name: 'FULBARI' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(update.execute(area.id, { name: 'MATIGARA' })).resolves.toMatchObject({ name: 'MATIGARA' });
  });
});

describe('parents', () => {
  it('rejects an HQ under a Zone that does not exist, naming the field', async () => {
    await expect(new CreateHqUseCase(hqs, zones).execute({ zoneId: 'missing', name: 'X' })).rejects.toMatchObject({
      statusCode: 400,
      publicDetails: { field: 'zoneId' },
    });
  });

  it('rejects an Area under an inactive HQ', async () => {
    const { hq } = await seedChain();
    await areas.update((await areas.findByName(hq.id, 'Matigara'))!.id, { status: 'inactive' });
    await new UpdateHqUseCase(hqs, zones, areas).execute(hq.id, { status: 'inactive' });

    await expect(
      new CreateAreaUseCase(areas, hqs).execute({ hqId: hq.id, name: 'Sevoke', type: 'OUT_STATION' }),
    ).rejects.toMatchObject({ statusCode: 409, publicDetails: { field: 'hqId' } });
  });

  it('rejects reactivating an HQ whose Zone is inactive', async () => {
    const { zone, hq, area } = await seedChain();
    await new UpdateAreaUseCase(areas, hqs, noRoutes).execute(area.id, { status: 'inactive' });
    await new UpdateHqUseCase(hqs, zones, areas).execute(hq.id, { status: 'inactive' });
    await new UpdateZoneUseCase(zones, hqs).execute(zone.id, { status: 'inactive' });

    await expect(new UpdateHqUseCase(hqs, zones, areas).execute(hq.id, { status: 'active' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('deactivation', () => {
  it('refuses to deactivate a Zone with an active HQ', async () => {
    const { zone } = await seedChain();
    await expect(new UpdateZoneUseCase(zones, hqs).execute(zone.id, { status: 'inactive' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { activeChildren: 1 },
    });
  });

  it('refuses to deactivate an HQ with an active Area, then allows it once the Area is inactive', async () => {
    const { hq, area } = await seedChain();
    const updateHq = new UpdateHqUseCase(hqs, zones, areas);

    await expect(updateHq.execute(hq.id, { status: 'inactive' })).rejects.toMatchObject({ statusCode: 409 });
    await new UpdateAreaUseCase(areas, hqs, noRoutes).execute(area.id, { status: 'inactive' });
    await expect(updateHq.execute(hq.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });

  it('returns 404 for an unknown id', async () => {
    await expect(new UpdateZoneUseCase(zones, hqs).execute('missing', { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
