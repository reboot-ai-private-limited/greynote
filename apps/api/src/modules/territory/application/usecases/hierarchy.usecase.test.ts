import { beforeEach, describe, expect, it } from 'vitest';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { Zone } from '../../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { CreateHqUseCase } from './createHq.usecase.js';
import { CreateZoneUseCase } from './createZone.usecase.js';
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
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => this.rows.get(id) ?? []);
  }
  async countActiveInZone(zoneId: string) {
    return this.countActiveIn(zoneId);
  }
}

/** An HQ's Routes: none here; route-dependent rules are in route.usecase.test.ts. */
let activeRoutes = 0;
const routes = { countActiveInHq: async () => activeRoutes } as unknown as RouteRepositoryPort;

let zones: FakeZones;
let hqs: FakeHqs;

beforeEach(() => {
  zones = new FakeZones();
  hqs = new FakeHqs();
  activeRoutes = 0;
});

async function seedChain() {
  const zone = await new CreateZoneUseCase(zones).execute({ name: 'West Bengal' });
  const hq = await new CreateHqUseCase(hqs, zones).execute({ zoneId: zone.id, name: 'SLG-1' });
  return { zone, hq };
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

  it('rejects renaming an HQ onto a sibling name, but allows re-saving its own name', async () => {
    const { zone, hq } = await seedChain();
    await new CreateHqUseCase(hqs, zones).execute({ zoneId: zone.id, name: 'SLG-2' });
    const update = new UpdateHqUseCase(hqs, zones, routes);

    await expect(update.execute(hq.id, { name: 'slg-2' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(update.execute(hq.id, { name: 'SLG-1' })).resolves.toMatchObject({ name: 'SLG-1' });
  });
});

describe('parents', () => {
  it('rejects an HQ under a Zone that does not exist, naming the field', async () => {
    await expect(new CreateHqUseCase(hqs, zones).execute({ zoneId: 'missing', name: 'X' })).rejects.toMatchObject({
      statusCode: 400,
      publicDetails: { field: 'zoneId' },
    });
  });

  it('rejects reactivating an HQ whose Zone is inactive', async () => {
    const { zone, hq } = await seedChain();
    await new UpdateHqUseCase(hqs, zones, routes).execute(hq.id, { status: 'inactive' });
    await new UpdateZoneUseCase(zones, hqs).execute(zone.id, { status: 'inactive' });

    await expect(new UpdateHqUseCase(hqs, zones, routes).execute(hq.id, { status: 'active' })).rejects.toMatchObject({
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

  it('refuses to deactivate an HQ with an active Route, then allows it once there is none', async () => {
    const { hq } = await seedChain();
    const updateHq = new UpdateHqUseCase(hqs, zones, routes);

    activeRoutes = 2;
    await expect(updateHq.execute(hq.id, { status: 'inactive' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { activeChildren: 2 },
    });
    activeRoutes = 0;
    await expect(updateHq.execute(hq.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });

  it('returns 404 for an unknown id', async () => {
    await expect(new UpdateZoneUseCase(zones, hqs).execute('missing', { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
