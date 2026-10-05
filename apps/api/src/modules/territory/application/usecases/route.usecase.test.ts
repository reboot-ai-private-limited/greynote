import { beforeEach, describe, expect, it } from 'vitest';
import type { DistanceProviderPort, DistanceResult, GeoPoint } from '../../domain/distanceProvider.port.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteAssignment } from '../../domain/routeAssignment.entity.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { AssignRouteUseCase } from './assignRoute.usecase.js';
import { CreateRouteUseCase } from './createRoute.usecase.js';
import { GetRoutePathUseCase } from './getRoutePath.usecase.js';
import { ListRoutesForUserUseCase } from './listRoutesForUser.usecase.js';
import { OverrideRouteDistanceUseCase } from './overrideRouteDistance.usecase.js';
import { RecalculateRouteDistanceUseCase } from './recalculateRouteDistance.usecase.js';
import { UpdateHqUseCase } from './updateHq.usecase.js';
import { UpdateRouteUseCase } from './updateRoute.usecase.js';
import { UnassignRouteUseCase } from './unassignRoute.usecase.js';
import { UpdateRouteDestinationUseCase } from './updateRouteDestination.usecase.js';
import { RouteTypeRules } from './routeTypeRules.js';
const typeRules = new RouteTypeRules({ get: async (key: string) => ({ EX_STATION_MIN_KM: '15', OUT_STATION_MIN_KM: '50' })[key] ?? '' });

const place = (label: string, latitude: number): Place => ({ label, latitude, longitude: 88.4, placeId: `place-${label}` });
const SILIGURI = place('Siliguri', 26.71);
const NAXALBARI = place('Naxalbari', 26.68);
const DHUPGURI = place('Dhupguri', 26.58);

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
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => this.rows.get(id) ?? []);
  }
  async findByName(hqId: string, name: string) {
    return [...this.rows.values()].find((r) => r.hqId === hqId && r.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async list(): Promise<{ items: Route[]; total: number }> {
    throw new Error('not used');
  }
  async listIdsInScope(scope: { hqId?: string | undefined }) {
    return [...this.rows.values()].filter((r) => r.hqId === scope.hqId).map((r) => r.id);
  }
  async countActiveInHq(hqId: string) {
    return [...this.rows.values()].filter((r) => r.hqId === hqId && r.status === 'active').length;
  }
  async listActiveInHq(hqId: string) {
    return [...this.rows.values()].filter((r) => r.hqId === hqId && r.status === 'active');
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

class FakeAssignments implements RouteAssignmentRepositoryPort {
  rows: RouteAssignment[] = [];
  async findActive(routeId: string, userId: string) {
    return this.rows.find((a) => a.routeId === routeId && a.userId === userId && a.status === 'active') ?? null;
  }
  async listForRoute(routeId: string) {
    return this.rows.filter((a) => a.routeId === routeId);
  }
  async listActiveForUser(userId: string) {
    return this.rows.filter((a) => a.userId === userId && a.status === 'active');
  }
  async countActiveForRoute(routeId: string) {
    return this.rows.filter((a) => a.routeId === routeId && a.status === 'active').length;
  }
  async create(input: { routeId: string; userId: string; assignedBy: string }) {
    const row: RouteAssignment = {
      ...input,
      id: `assignment-${this.rows.length + 1}`,
      status: 'active',
      assignedAt: new Date(),
      unassignedAt: null,
      unassignedBy: null,
    };
    this.rows.push(row);
    return row;
  }
  async deactivate(id: string, unassignedBy: string) {
    const row = this.rows.find((a) => a.id === id) as RouteAssignment;
    Object.assign(row, { status: 'inactive', unassignedAt: new Date(), unassignedBy });
    return row;
  }
}

type UserRow = NonNullable<Awaited<ReturnType<UserDirectoryPort['findUserSummary']>>>;
const USERS: UserRow[] = [
  { id: 'mr-1', employeeCode: 'MR001', name: 'Asha', role: 'FIELD', status: 'active' },
  { id: 'mr-new', employeeCode: 'MR002', name: 'Bikram', role: 'FIELD', status: 'pending' },
  { id: 'mr-left', employeeCode: 'MR003', name: 'Chandan', role: 'FIELD', status: 'inactive' },
  { id: 'hr-1', employeeCode: 'HR001', name: 'Dipa', role: 'HR', status: 'active' },
];
const users: UserDirectoryPort = { findUserSummary: async (id) => USERS.find((u) => u.id === id) ?? null };

let hqRow: Hq;
const hqs = {
  findById: async (id: string) => (id === hqRow.id ? hqRow : null),
  findByIds: async (ids: string[]) => (ids.includes(hqRow.id) ? [hqRow] : []),
  findByName: async () => null,
  update: async (_id: string, input: Partial<Hq>) => (hqRow = { ...hqRow, ...input }),
} as unknown as HqRepositoryPort;
const zones = { findById: async () => ({ id: 'zone-1', name: 'West Bengal', status: 'active' }) } as unknown as ZoneRepositoryPort;

let routes: FakeRoutes;
let distance: FakeDistance;
let assignments: FakeAssignments;

beforeEach(() => {
  hqRow = { id: 'hq-1', zoneId: 'zone-1', name: 'SLG-1', basePlace: SILIGURI, status: 'active' };
  routes = new FakeRoutes();
  distance = new FakeDistance();
  assignments = new FakeAssignments();
});

const createRoute = (overrides: Partial<Parameters<CreateRouteUseCase['execute']>[0]> = {}) =>
  new CreateRouteUseCase(routes, hqs, distance, typeRules).execute({
    hqId: hqRow.id,
    name: 'Naxalbari',
    type: 'EX_STATION',
    destination: NAXALBARI,
    ...overrides,
  });

describe('creating a route', () => {
  it('stores the road distance in km, as given — no round-trip doubling', async () => {
    const route = await createRoute();
    expect(route).toMatchObject({
      distanceKm: '12.35',
      distanceSource: 'AUTO_CALCULATED',
      distanceStatus: 'CALCULATED',
      type: 'EX_STATION',
      revision: 1,
      taPerKmRateOverridePaise: null,
    });
    expect(route.distanceCalculatedAt).toBeInstanceOf(Date);
  });

  it("measures from the HQ's base place to the destination", async () => {
    await createRoute();
    expect(distance.calls).toEqual([[SILIGURI, NAXALBARI]]);
  });

  it('still saves when the provider fails, as FAILED with no distance', async () => {
    distance.next = { ok: false, reason: 'HTTP 403' };
    const route = await createRoute();
    expect(route).toMatchObject({ distanceKm: null, distanceStatus: 'FAILED', distanceCalculatedAt: null });
    expect(routes.rows.size).toBe(1);
  });

  it('refuses an inactive HQ and a duplicate name within the HQ', async () => {
    await createRoute();
    await expect(createRoute({ name: 'NAXALBARI' })).rejects.toMatchObject({ statusCode: 409 });
    hqRow = { ...hqRow, status: 'inactive' };
    await expect(createRoute({ name: 'Other' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { field: 'hqId' },
    });
  });

  it('refuses an HQ with no base place yet, without calling the provider', async () => {
    hqRow = { ...hqRow, basePlace: null };
    await expect(createRoute()).rejects.toMatchObject({ statusCode: 409, publicDetails: { field: 'hqId' } });
    expect(distance.calls).toHaveLength(0);
    expect(routes.rows.size).toBe(0);
  });

  it('allows the same route name under two HQs', async () => {
    await createRoute();
    hqRow = { ...hqRow, id: 'hq-2', name: 'SLG-2' };
    await expect(createRoute({ hqId: 'hq-2' })).resolves.toMatchObject({ hqId: 'hq-2' });
  });
});

describe('manual override', () => {
  it('sets MANUAL_OVERRIDE and fixes a FAILED route', async () => {
    distance.next = { ok: false, reason: 'timeout' };
    const route = await createRoute();
    const overridden = await new OverrideRouteDistanceUseCase(routes, typeRules).execute(route.id, { distanceKm: '18.50' });
    expect(overridden).toMatchObject({
      distanceKm: '18.50',
      distanceSource: 'MANUAL_OVERRIDE',
      distanceStatus: 'CALCULATED',
      destination: NAXALBARI,
      revision: 2,
    });
  });

  it('is replaced by the next destination edit', async () => {
    const route = await createRoute();
    const overridden = await new OverrideRouteDistanceUseCase(routes, typeRules).execute(route.id, { distanceKm: '18.50' });
    distance.next = { ok: true, meters: 20_000 };

    const edited = await new UpdateRouteDestinationUseCase(routes, hqs, distance, typeRules).execute(route.id, {
      destination: DHUPGURI,
      revision: overridden.revision,
    });
    expect(edited).toMatchObject({
      destination: DHUPGURI,
      distanceKm: '20.00',
      distanceSource: 'AUTO_CALCULATED',
      revision: 3,
    });
  });

  it('is replaced by a recalculation', async () => {
    const route = await createRoute();
    await new OverrideRouteDistanceUseCase(routes, typeRules).execute(route.id, { distanceKm: '18.50' });
    const recalculated = await new RecalculateRouteDistanceUseCase(routes, hqs, distance, typeRules).execute(route.id);
    expect(recalculated).toMatchObject({ distanceKm: '12.35', distanceSource: 'AUTO_CALCULATED' });
  });

  it('survives a rename and a TA rate change, which leave distance alone', async () => {
    const route = await createRoute();
    await new OverrideRouteDistanceUseCase(routes, typeRules).execute(route.id, { distanceKm: '18.50' });
    const updated = await new UpdateRouteUseCase(routes, hqs, assignments, typeRules).execute(route.id, {
      name: 'Renamed',
      taPerKmRateOverridePaise: 450,
    });
    expect(updated).toMatchObject({ distanceKm: '18.50', distanceSource: 'MANUAL_OVERRIDE', taPerKmRateOverridePaise: 450 });
  });
});

describe('the TA rate override', () => {
  it('survives a destination edit', async () => {
    const route = await createRoute({ taPerKmRateOverridePaise: 450 });
    const edited = await new UpdateRouteDestinationUseCase(routes, hqs, distance, typeRules).execute(route.id, {
      destination: DHUPGURI,
      revision: 1,
    });
    expect(edited.taPerKmRateOverridePaise).toBe(450);
  });
});

describe('revisions', () => {
  it('refuses a destination edit made against an old revision, without calling the provider', async () => {
    const route = await createRoute();
    await new OverrideRouteDistanceUseCase(routes, typeRules).execute(route.id, { distanceKm: '18.50' });
    distance.calls = [];

    await expect(
      new UpdateRouteDestinationUseCase(routes, hqs, distance, typeRules).execute(route.id, { destination: DHUPGURI, revision: 1 }),
    ).rejects.toMatchObject({ statusCode: 409, publicDetails: { field: 'revision', currentRevision: 2 } });
    expect(distance.calls).toHaveLength(0);
  });

  it('refuses a recalculation whose route changed during the provider call, keeping the newer write', async () => {
    const route = await createRoute();
    distance.during = async () => {
      distance.during = undefined;
      await new OverrideRouteDistanceUseCase(routes, typeRules).execute(route.id, { distanceKm: '18.50' });
    };

    await expect(new RecalculateRouteDistanceUseCase(routes, hqs, distance, typeRules).execute(route.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(routes.rows.get(route.id)).toMatchObject({ distanceKm: '18.50', distanceSource: 'MANUAL_OVERRIDE' });
  });
});

describe('route type', () => {
  it('can be changed without touching the distance, and is not revision-checked', async () => {
    const route = await createRoute();
    const updated = await new UpdateRouteUseCase(routes, hqs, assignments, typeRules).execute(route.id, { type: 'OUT_STATION' });
    expect(updated).toMatchObject({ type: 'OUT_STATION', distanceKm: '12.35', revision: 1 });
  });
});

describe('HQ deactivation', () => {
  it('is refused while the HQ has an active route, allowed once it is inactive', async () => {
    const route = await createRoute();
    const updateHq = new UpdateHqUseCase(hqs, zones, routes, distance, typeRules);

    await expect(updateHq.execute(hqRow.id, { status: 'inactive' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { activeChildren: 1 },
    });
    await new UpdateRouteUseCase(routes, hqs, assignments, typeRules).execute(route.id, { status: 'inactive' });
    await expect(updateHq.execute(hqRow.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });
});

describe("changing an HQ's base place", () => {
  const MATIGARA = place('Matigara', 26.7);
  const moveBase = () => new UpdateHqUseCase(hqs, zones, routes, distance, typeRules).execute(hqRow.id, { basePlace: MATIGARA });

  it("recalculates each active route from the new base place", async () => {
    const a = await createRoute({ name: 'Naxalbari' });
    const b = await createRoute({ name: 'Dhupguri', destination: DHUPGURI });
    distance.calls = [];
    distance.next = { ok: true, meters: 8_000 };

    const result = await moveBase();

    expect(result.routeRecalculation).toEqual({ recalculated: 2, failed: 0, overridden: [] });
    expect(distance.calls).toEqual([
      [MATIGARA, NAXALBARI],
      [MATIGARA, DHUPGURI],
    ]);
    expect(routes.rows.get(a.id)).toMatchObject({ distanceKm: '8.00', revision: 2 });
    expect(routes.rows.get(b.id)).toMatchObject({ distanceKm: '8.00', revision: 2 });
    expect(hqRow.basePlace).toEqual(MATIGARA);
  });

  it('leaves a manually overridden route alone and names it in the report', async () => {
    const manual = await createRoute({ name: 'Naxalbari' });
    await new OverrideRouteDistanceUseCase(routes, typeRules).execute(manual.id, { distanceKm: '18.50' });
    const auto = await createRoute({ name: 'Dhupguri', destination: DHUPGURI });
    distance.calls = [];

    const result = await moveBase();

    expect(result.routeRecalculation).toEqual({
      recalculated: 1,
      failed: 0,
      overridden: [{ id: manual.id, name: 'Naxalbari' }],
    });
    expect(routes.rows.get(manual.id)).toMatchObject({ distanceKm: '18.50', distanceSource: 'MANUAL_OVERRIDE' });
    expect(routes.rows.get(auto.id)).toMatchObject({ distanceSource: 'AUTO_CALCULATED' });
    expect(distance.calls).toHaveLength(1);
  });

  it('counts a provider failure but still recalculates the rest', async () => {
    await createRoute({ name: 'Naxalbari' });
    await createRoute({ name: 'Dhupguri', destination: DHUPGURI });
    let calls = 0;
    const real = distance.roadDistance.bind(distance);
    distance.roadDistance = async (points) => {
      calls += 1;
      const answer = await real(points);
      return calls === 1 ? { ok: false, reason: 'timeout' } : answer;
    };

    const result = await moveBase();

    expect(result.routeRecalculation).toEqual({ recalculated: 1, failed: 1, overridden: [] });
  });

  it('skips inactive routes', async () => {
    const route = await createRoute();
    await new UpdateRouteUseCase(routes, hqs, assignments, typeRules).execute(route.id, { status: 'inactive' });
    distance.calls = [];

    const result = await moveBase();

    expect(result.routeRecalculation).toEqual({ recalculated: 0, failed: 0, overridden: [] });
    expect(distance.calls).toHaveLength(0);
  });

  it('does nothing to the routes when the base place did not change', async () => {
    await createRoute();
    distance.calls = [];
    const result = await new UpdateHqUseCase(hqs, zones, routes, distance, typeRules).execute(hqRow.id, { basePlace: { ...SILIGURI } });
    expect(result.routeRecalculation).toBeUndefined();
    expect(distance.calls).toHaveLength(0);
  });

  it('does not recalculate when only the name or status changes', async () => {
    await createRoute();
    distance.calls = [];
    const result = await new UpdateHqUseCase(hqs, zones, routes, distance, typeRules).execute(hqRow.id, { name: 'SLG-One' });
    expect(result.routeRecalculation).toBeUndefined();
    expect(distance.calls).toHaveLength(0);
  });

  it('gives an HQ that had no base place its first one, and recalculates routes that predate it', async () => {
    const route = await createRoute();
    hqRow = { ...hqRow, basePlace: null };
    await routes.updateAtRevision(route.id, 1, { distanceKm: null, distanceStatus: 'FAILED', distanceCalculatedAt: null });
    distance.calls = [];

    const result = await moveBase();

    expect(result.routeRecalculation).toEqual({ recalculated: 1, failed: 0, overridden: [] });
    expect(routes.rows.get(route.id)).toMatchObject({ distanceStatus: 'CALCULATED' });
  });
});

describe('assignments', () => {
  const assign = (routeId: string, userId: string) =>
    new AssignRouteUseCase(routes, assignments, users).execute(routeId, userId, 'admin-1');

  it('assigns a FIELD employee, including one still onboarding', async () => {
    const route = await createRoute();
    await expect(assign(route.id, 'mr-1')).resolves.toMatchObject({ status: 'active', assignedBy: 'admin-1' });
    await expect(assign(route.id, 'mr-new')).resolves.toMatchObject({ userId: 'mr-new' });
  });

  it('refuses unknown, non-FIELD and inactive employees, and a second active assignment', async () => {
    const route = await createRoute();
    await expect(assign(route.id, 'nobody')).rejects.toMatchObject({ statusCode: 400, publicDetails: { field: 'userId' } });
    await expect(assign(route.id, 'hr-1')).rejects.toMatchObject({ statusCode: 400 });
    await expect(assign(route.id, 'mr-left')).rejects.toMatchObject({ statusCode: 409 });
    await assign(route.id, 'mr-1');
    await expect(assign(route.id, 'mr-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses assigning to an inactive route', async () => {
    const route = await createRoute();
    await new UpdateRouteUseCase(routes, hqs, assignments, typeRules).execute(route.id, { status: 'inactive' });
    await expect(assign(route.id, 'mr-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps history: unassign marks the row inactive, a re-assign adds a new row', async () => {
    const route = await createRoute();
    await assign(route.id, 'mr-1');
    const ended = await new UnassignRouteUseCase(assignments).execute(route.id, 'mr-1', 'admin-2');
    expect(ended).toMatchObject({ status: 'inactive', unassignedBy: 'admin-2' });

    await assign(route.id, 'mr-1');
    expect(assignments.rows.map((a) => a.status)).toEqual(['inactive', 'active']);
    await expect(new UnassignRouteUseCase(assignments).execute(route.id, 'mr-new', 'admin-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('blocks deactivating a route that still has an active assignment', async () => {
    const route = await createRoute();
    await assign(route.id, 'mr-1');
    const update = new UpdateRouteUseCase(routes, hqs, assignments, typeRules);

    await expect(update.execute(route.id, { status: 'inactive' })).rejects.toMatchObject({ statusCode: 409 });
    await new UnassignRouteUseCase(assignments).execute(route.id, 'mr-1', 'admin-1');
    await expect(update.execute(route.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });
});

describe('contract reads', () => {
  it("lists an employee's active routes with the type that drives DA, sorted by name", async () => {
    const b = await createRoute({ name: 'B route' });
    const a = await createRoute({ name: 'A route' });
    const ended = await createRoute({ name: 'Ended route' });
    const assign = new AssignRouteUseCase(routes, assignments, users);
    for (const r of [b, a, ended]) await assign.execute(r.id, 'mr-1', 'admin-1');
    await new UnassignRouteUseCase(assignments).execute(ended.id, 'mr-1', 'admin-1');

    const mine = await new ListRoutesForUserUseCase(assignments, routes, hqs).execute('mr-1');
    expect(mine.map((r) => r.name)).toEqual(['A route', 'B route']);
    expect(mine[0]).toMatchObject({ hqName: 'SLG-1', routeType: 'EX_STATION', distanceKm: '12.35', distanceStatus: 'CALCULATED' });
    expect(mine[0]).not.toHaveProperty('destination');
  });

  it("resolves a route's HQ / Zone path and type, and null for an unknown route", async () => {
    const route = await createRoute();
    const getPath = new GetRoutePathUseCase(routes, hqs);
    await expect(getPath.execute(route.id)).resolves.toEqual({
      routeId: route.id,
      routeType: 'EX_STATION',
      hqId: 'hq-1',
      zoneId: 'zone-1',
    });
    await expect(getPath.execute('missing')).resolves.toBeNull();
  });
});


describe('Route type from distance (decision-log 2026-10-05)', () => {
  const noType = (overrides: Partial<Parameters<CreateRouteUseCase['execute']>[0]> = {}) => createRoute({ type: undefined, ...overrides });
  const kmAway = (km: number) => (distance.next = { ok: true, meters: km * 1000 });

  it('a Route created without a type takes it from the distance, as AUTO', async () => {
    kmAway(15);
    expect(await noType()).toMatchObject({ type: 'HQ', typeSource: 'AUTO', typeWarning: null });
    kmAway(15.5);
    expect(await noType({ name: 'B' })).toMatchObject({ type: 'EX_STATION', typeSource: 'AUTO' });
    kmAway(51);
    expect(await noType({ name: 'C' })).toMatchObject({ type: 'OUT_STATION', typeSource: 'AUTO' });
  });

  it('a Route with no usable distance starts as HQ (AUTO) and follows the distance when a recalculation succeeds', async () => {
    distance.next = { ok: false } as DistanceResult;
    const route = await noType();
    expect(route).toMatchObject({ type: 'HQ', typeSource: 'AUTO', distanceStatus: 'FAILED' });
    kmAway(60);
    const again = await new RecalculateRouteDistanceUseCase(routes, hqs, distance, typeRules).execute(route.id);
    expect(again).toMatchObject({ type: 'OUT_STATION', typeSource: 'AUTO', typeWarning: null });
  });

  it('a chosen type is kept as MANUAL; if the distance disagrees there is a warning and no refusal', async () => {
    kmAway(30);
    const route = await createRoute({ type: 'HQ' });
    expect(route).toMatchObject({ type: 'HQ', typeSource: 'MANUAL' });
    expect(route.typeWarning).toContain('suggests Ex-station');
    kmAway(30);
    expect((await createRoute({ name: 'Agrees', type: 'EX_STATION' })).typeWarning).toBeNull();
  });

  it('an AUTO Route follows a destination edit and a distance override, a MANUAL one does not', async () => {
    kmAway(10);
    const auto = await noType();
    const manual = await createRoute({ name: 'Manual', type: 'HQ' });
    kmAway(60);
    const movedAuto = await new UpdateRouteDestinationUseCase(routes, hqs, distance, typeRules).execute(auto.id, { destination: DHUPGURI, revision: auto.revision });
    const movedManual = await new UpdateRouteDestinationUseCase(routes, hqs, distance, typeRules).execute(manual.id, { destination: DHUPGURI, revision: manual.revision });
    expect(movedAuto).toMatchObject({ type: 'OUT_STATION', typeSource: 'AUTO' });
    expect(movedManual).toMatchObject({ type: 'HQ', typeSource: 'MANUAL' });
    expect(movedManual.typeWarning).toContain('suggests Out-station');

    const overridden = await new OverrideRouteDistanceUseCase(routes, typeRules).execute(auto.id, { distanceKm: '20.00' });
    expect(overridden).toMatchObject({ type: 'EX_STATION', typeSource: 'AUTO' });
  });

  it('choosing a type makes a Route MANUAL; typeSource AUTO hands it back to the distance', async () => {
    kmAway(30);
    const route = await noType();
    const update = new UpdateRouteUseCase(routes, hqs, assignments, typeRules);
    expect(await update.execute(route.id, { type: 'OUT_STATION' })).toMatchObject({ type: 'OUT_STATION', typeSource: 'MANUAL' });
    expect(await update.execute(route.id, { typeSource: 'AUTO' })).toMatchObject({ type: 'EX_STATION', typeSource: 'AUTO', typeWarning: null });
  });

  it('a Route saved before typeSource existed reads as MANUAL, so nothing about it changes', async () => {
    kmAway(10);
    const route = await createRoute({ type: 'OUT_STATION' });
    expect(route.typeSource).toBe('MANUAL');
  });
});
