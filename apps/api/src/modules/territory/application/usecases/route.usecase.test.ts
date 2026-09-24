import { beforeEach, describe, expect, it } from 'vitest';
import type { Area } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { DistanceProviderPort, DistanceResult, GeoPoint } from '../../domain/distanceProvider.port.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Route, Waypoint } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { CreateRouteUseCase } from './createRoute.usecase.js';
import { OverrideRouteDistanceUseCase } from './overrideRouteDistance.usecase.js';
import { RecalculateRouteDistanceUseCase } from './recalculateRouteDistance.usecase.js';
import { UpdateAreaUseCase } from './updateArea.usecase.js';
import { UpdateRouteUseCase } from './updateRoute.usecase.js';
import { UpdateRouteWaypointsUseCase } from './updateRouteWaypoints.usecase.js';

const wp = (label: string, latitude: number): Waypoint => ({ label, latitude, longitude: 88.4, placeId: `place-${label}` });
const MATIGARA_TO_FULBARI = [wp('Matigara', 26.7), wp('Medical More', 26.72), wp('Fulbari', 26.75)];

/** Answers with whatever `next` is set to, and records each call's points. */
class FakeDistance implements DistanceProviderPort {
  next: DistanceResult = { ok: true, meters: 12_345 };
  calls: GeoPoint[][] = [];
  /** Runs during the provider call — lets a test land a concurrent write mid-calculation. */
  during: (() => Promise<void>) | undefined;
  async roadDistance(points: GeoPoint[]) {
    this.calls.push(points);
    await this.during?.();
    return this.next;
  }
}

class FakeRoutes implements RouteRepositoryPort {
  rows = new Map<string, Route>();
  private nextId = 1;
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByName(areaId: string, name: string) {
    return [...this.rows.values()].find((r) => r.areaId === areaId && r.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async list(): Promise<{ items: Route[]; total: number }> {
    throw new Error('not used');
  }
  async countActiveInArea(areaId: string) {
    return [...this.rows.values()].filter((r) => r.areaId === areaId && r.status === 'active').length;
  }
  async create(input: Omit<Route, 'id'>) {
    const row = { ...input, id: `route-${this.nextId++}` };
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, input: Partial<Route>) {
    const row = { ...(this.rows.get(id) as Route), ...input };
    this.rows.set(id, row);
    return row;
  }
  async updateAtRevision(id: string, expectedRevision: number, change: Partial<Route>) {
    const row = this.rows.get(id);
    if (!row || row.revision !== expectedRevision) return null;
    const updated = { ...row, ...change, revision: row.revision + 1 };
    this.rows.set(id, updated);
    return updated;
  }
}

const hq: Hq = { id: 'hq-1', zoneId: 'zone-1', name: 'Siliguri', status: 'active' };
let areaRow: Area;
const areas = {
  findById: async (id: string) => (id === areaRow.id ? areaRow : null),
  findByName: async () => null,
  update: async (_id: string, input: Partial<Area>) => (areaRow = { ...areaRow, ...input }),
} as unknown as AreaRepositoryPort;
const hqs = { findById: async () => hq } as unknown as HqRepositoryPort;

let routes: FakeRoutes;
let distance: FakeDistance;

beforeEach(() => {
  areaRow = { id: 'area-1', hqId: hq.id, name: 'Matigara', type: 'HQ', status: 'active' };
  routes = new FakeRoutes();
  distance = new FakeDistance();
});

const createRoute = (overrides: Partial<Parameters<CreateRouteUseCase['execute']>[0]> = {}) =>
  new CreateRouteUseCase(routes, areas, distance).execute({
    areaId: areaRow.id,
    name: 'Matigara via Medical More to Fulbari',
    waypoints: MATIGARA_TO_FULBARI,
    ...overrides,
  });

describe('creating a route', () => {
  it('stores the road distance in km, as given — no round-trip doubling', async () => {
    const route = await createRoute();
    expect(route).toMatchObject({
      distanceKm: '12.35',
      distanceSource: 'AUTO_CALCULATED',
      distanceStatus: 'CALCULATED',
      revision: 1,
      taPerKmRateOverride: null,
    });
    expect(route.distanceCalculatedAt).toBeInstanceOf(Date);
  });

  it('sends the waypoints to the provider in exactly the order given', async () => {
    await createRoute();
    expect(distance.calls[0]?.map((p) => p.latitude)).toEqual([26.7, 26.72, 26.75]);
  });

  it('still saves when the provider fails, as FAILED with no distance', async () => {
    distance.next = { ok: false, reason: 'HTTP 403' };
    const route = await createRoute();
    expect(route).toMatchObject({ distanceKm: null, distanceStatus: 'FAILED', distanceCalculatedAt: null });
    expect(routes.rows.size).toBe(1);
  });

  it('refuses an inactive Area and a duplicate name within the Area', async () => {
    await createRoute();
    await expect(createRoute({ name: 'MATIGARA VIA MEDICAL MORE TO FULBARI' })).rejects.toMatchObject({ statusCode: 409 });
    areaRow = { ...areaRow, status: 'inactive' };
    await expect(createRoute({ name: 'Other' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { field: 'areaId' },
    });
  });
});

describe('manual override', () => {
  it('sets MANUAL_OVERRIDE and fixes a FAILED route', async () => {
    distance.next = { ok: false, reason: 'timeout' };
    const route = await createRoute();
    const overridden = await new OverrideRouteDistanceUseCase(routes).execute(route.id, { distanceKm: '18.50' });
    expect(overridden).toMatchObject({
      distanceKm: '18.50',
      distanceSource: 'MANUAL_OVERRIDE',
      distanceStatus: 'CALCULATED',
      waypoints: MATIGARA_TO_FULBARI,
      revision: 2,
    });
  });

  it('is replaced by the next waypoint edit', async () => {
    const route = await createRoute();
    const overridden = await new OverrideRouteDistanceUseCase(routes).execute(route.id, { distanceKm: '18.50' });
    distance.next = { ok: true, meters: 20_000 };

    const edited = await new UpdateRouteWaypointsUseCase(routes, distance).execute(route.id, {
      waypoints: [wp('Matigara', 26.7), wp('Sevoke', 26.9)],
      revision: overridden.revision,
    });
    expect(edited).toMatchObject({ distanceKm: '20.00', distanceSource: 'AUTO_CALCULATED', revision: 3 });
  });

  it('is replaced by a recalculation', async () => {
    const route = await createRoute();
    await new OverrideRouteDistanceUseCase(routes).execute(route.id, { distanceKm: '18.50' });
    const recalculated = await new RecalculateRouteDistanceUseCase(routes, distance).execute(route.id);
    expect(recalculated).toMatchObject({ distanceKm: '12.35', distanceSource: 'AUTO_CALCULATED' });
  });

  it('survives a rename and a TA rate change, which leave distance alone', async () => {
    const route = await createRoute();
    await new OverrideRouteDistanceUseCase(routes).execute(route.id, { distanceKm: '18.50' });
    const updated = await new UpdateRouteUseCase(routes, areas).execute(route.id, {
      name: 'Renamed',
      taPerKmRateOverride: '4.50',
    });
    expect(updated).toMatchObject({ distanceKm: '18.50', distanceSource: 'MANUAL_OVERRIDE', taPerKmRateOverride: '4.50' });
  });
});

describe('the TA rate override', () => {
  it('survives a waypoint edit', async () => {
    const route = await createRoute({ taPerKmRateOverride: '4.50' });
    const edited = await new UpdateRouteWaypointsUseCase(routes, distance).execute(route.id, {
      waypoints: MATIGARA_TO_FULBARI,
      revision: 1,
    });
    expect(edited.taPerKmRateOverride).toBe('4.50');
  });
});

describe('revisions', () => {
  it('refuses a waypoint edit made against an old revision, without calling the provider', async () => {
    const route = await createRoute();
    await new OverrideRouteDistanceUseCase(routes).execute(route.id, { distanceKm: '18.50' });
    distance.calls = [];

    await expect(
      new UpdateRouteWaypointsUseCase(routes, distance).execute(route.id, { waypoints: MATIGARA_TO_FULBARI, revision: 1 }),
    ).rejects.toMatchObject({ statusCode: 409, publicDetails: { field: 'revision', currentRevision: 2 } });
    expect(distance.calls).toHaveLength(0);
  });

  it('refuses a recalculation whose route changed during the provider call, keeping the newer write', async () => {
    const route = await createRoute();
    distance.during = async () => {
      distance.during = undefined;
      await new OverrideRouteDistanceUseCase(routes).execute(route.id, { distanceKm: '18.50' });
    };

    await expect(new RecalculateRouteDistanceUseCase(routes, distance).execute(route.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(routes.rows.get(route.id)).toMatchObject({ distanceKm: '18.50', distanceSource: 'MANUAL_OVERRIDE' });
  });
});

describe('Area deactivation', () => {
  it('is refused while the Area has an active route, allowed once it is inactive', async () => {
    const route = await createRoute();
    const updateArea = new UpdateAreaUseCase(areas, hqs, routes);

    await expect(updateArea.execute(areaRow.id, { status: 'inactive' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { activeChildren: 1 },
    });
    await new UpdateRouteUseCase(routes, areas).execute(route.id, { status: 'inactive' });
    await expect(updateArea.execute(areaRow.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });
});
