import { beforeEach, describe, expect, it } from 'vitest';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.entity.js';
import type { PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteAssignment } from '../../domain/routeAssignment.entity.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { AssignRouteUseCase } from './assignRoute.usecase.js';
import { CreateRouteUseCase } from './createRoute.usecase.js';
import { GetRoutePathUseCase } from './getRoutePath.usecase.js';
import { ListRoutesForUserUseCase, ListRoutesForUsersUseCase } from './listRoutesForUser.usecase.js';
import { UpdateHqUseCase } from './updateHq.usecase.js';
import { UpdateRouteUseCase } from './updateRoute.usecase.js';
import { UnassignRouteUseCase } from './unassignRoute.usecase.js';
import { RouteTypeRules } from './routeTypeRules.js';
import { PlaceRoutes } from './placeRoutes.js';
import { CreatePlaceUseCase, ListPlacesUseCase, UpdatePlaceUseCase } from './places.usecase.js';
import { pairKeyOf } from '../../domain/place.entity.js';
import { ImportRoutesUseCase } from './importRoutes.usecase.js';
import type { RouteImportRow } from '../../interface/routesImport.csv.js';
const typeRules = new RouteTypeRules({ get: async (key: string) => ({ EX_STATION_MIN_KM: '15', OUT_STATION_MIN_KM: '50' })[key] ?? '' });

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
  async listInHq(hqId: string) {
    return [...this.rows.values()].filter((r) => r.hqId === hqId);
  }
  /** Both ends' places in these HQs (looked up in `places`), or a route not yet migrated whose HQ is one of them. */
  placesRef: FakePlaces | null = null;
  async listActiveWithinHqs(hqIds: string[]) {
    const hqOf = (id: string | null) => (id ? this.placesRef?.rows.get(id)?.hqId : undefined);
    return [...this.rows.values()].filter(
      (r) => r.status === 'active' && (r.fromPlaceId ? hqIds.includes(hqOf(r.fromPlaceId) ?? '') && hqIds.includes(hqOf(r.toPlaceId) ?? '') : hqIds.includes(r.hqId)),
    );
  }
  async findByPair(a: string, b: string) {
    return [...this.rows.values()].find((r) => r.fromPlaceId && r.toPlaceId && pairKeyOf(r.fromPlaceId, r.toPlaceId) === pairKeyOf(a, b)) ?? null;
  }
  async listTouchingPlace(placeId: string) {
    return [...this.rows.values()].filter((r) => r.fromPlaceId === placeId || r.toPlaceId === placeId);
  }
  async countActiveTouchingPlace(placeId: string) {
    return (await this.listTouchingPlace(placeId)).filter((r) => r.status === 'active').length;
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
}

/** A place on its own, with no route yet: how these tests build up routes one by one (the API itself always adds a place with its route). */
const rawPlace = (hqId: string, name: string, type: Place['type']) => places.create({ hqId, name, type, isHqTown: false, status: 'active' });

class FakePlaces implements PlaceRepositoryPort {
  rows = new Map<string, Place>();
  private nextId = 1;
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => this.rows.get(id) ?? []);
  }
  async findByName(hqId: string, name: string) {
    return [...this.rows.values()].find((p) => p.hqId === hqId && p.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async findHqTown(hqId: string) {
    return [...this.rows.values()].find((p) => p.hqId === hqId && p.isHqTown) ?? null;
  }
  async list(query: { hqId?: string | undefined }) {
    const items = [...this.rows.values()].filter((p) => !query.hqId || p.hqId === query.hqId);
    return { items, total: items.length };
  }
  async countActiveOutsideTownInHq(hqId: string) {
    return [...this.rows.values()].filter((p) => p.hqId === hqId && !p.isHqTown && p.status === 'active').length;
  }
  async create(input: Omit<Place, 'id'>) {
    const row = { ...input, id: `place-${this.nextId++}` };
    this.rows.set(row.id, row);
    return row;
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async update(id: string, input: Partial<Place>) {
    const row = { ...(this.rows.get(id) as Place), ...input };
    this.rows.set(id, row);
    return row;
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
  async listActiveForUsers(userIds: string[]) {
    return this.rows.filter((a) => userIds.includes(a.userId) && a.status === 'active');
  }
  async listActiveForRoutes(routeIds: string[]) {
    return this.rows.filter((a) => routeIds.includes(a.routeId) && a.status === 'active');
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
const users: UserDirectoryPort = {
  findUserSummary: async (id) => USERS.find((u) => u.id === id) ?? null,
  recordUserTerritory: async () => undefined,
};

let hqRow: Hq;
/** Other HQs, for routes that cross from one HQ to another. */
let otherHqs: Hq[];
const hqs = {
  findById: async (id: string) => (id === hqRow.id ? hqRow : (otherHqs.find((h) => h.id === id) ?? null)),
  findByIds: async (ids: string[]) => [hqRow, ...otherHqs].filter((h) => ids.includes(h.id)),
  findByName: async () => null,
  list: async () => ({ items: [hqRow, ...otherHqs], total: 1 + otherHqs.length }),
  update: async (_id: string, input: Partial<Hq>) => (hqRow = { ...hqRow, ...input }),
} as unknown as HqRepositoryPort;
const zones = { findById: async () => ({ id: 'zone-1', name: 'West Bengal', status: 'active' }) } as unknown as ZoneRepositoryPort;

let routes: FakeRoutes;
let places: FakePlaces;
let placeRoutes: PlaceRoutes;
let assignments: FakeAssignments;

beforeEach(() => {
  hqRow = { id: 'hq-1', zoneId: 'zone-1', name: 'SLG-1', status: 'active' };
  otherHqs = [];
  routes = new FakeRoutes();
  places = new FakePlaces();
  routes.placesRef = places;
  placeRoutes = new PlaceRoutes(places, hqs, routes);
  assignments = new FakeAssignments();
});

type LegacyInput = { hqId: string; destinationName: string; distanceKm: string; type?: 'HQ' | 'EX_STATION' | 'OUT_STATION' | undefined; taPerKmRateOverridePaise?: number | null };
const newRoute = () => new CreateRouteUseCase(routes, hqs, places, placeRoutes, typeRules);
/** The older "<HQ> to <destination>" form: it becomes HQ town ↔ a place of that name. */
const createRoute = (overrides: Partial<LegacyInput> = {}) =>
  newRoute().execute({ hqId: hqRow.id, destinationName: 'Naxalbari', distanceKm: '12.35', type: 'EX_STATION', ...overrides });
const updateRoute = () => new UpdateRouteUseCase(routes, hqs, assignments, placeRoutes, typeRules);
const updateHq = () => new UpdateHqUseCase(hqs, zones, routes, places, placeRoutes);
/** A route from before Places, not yet migrated: no ends. */
async function legacyRoute(destinationName = 'Naxalbari', fields: Partial<Route> = {}): Promise<Route> {
  return routes.create({
    hqId: hqRow.id,
    name: `${hqRow.name} to ${destinationName}`,
    destinationName,
    type: 'EX_STATION',
    typeSource: 'MANUAL',
    distanceKm: '12.35',
    taPerKmRateOverridePaise: null,
    taFixedPaise: null,
    fromPlaceId: null,
    toPlaceId: null,
    status: 'active',
    ...fields,
  });
}


describe('creating a route', () => {
  it('is named "<HQ> to <destination>" and stores the typed km as given — no round-trip doubling', async () => {
    const route = await createRoute();
    expect(route).toMatchObject({
      name: 'SLG-1 to Naxalbari',
      destinationName: 'Naxalbari',
      distanceKm: '12.35',
      type: 'EX_STATION',
      taPerKmRateOverridePaise: null,
    });
  });

  it('refuses an inactive HQ and a duplicate destination within the HQ, ignoring case', async () => {
    await createRoute();
    await expect(createRoute({ destinationName: 'NAXALBARI' })).rejects.toMatchObject({ statusCode: 409 });
    hqRow = { ...hqRow, status: 'inactive' };
    await expect(createRoute({ destinationName: 'Other' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { field: 'hqId' },
    });
  });

  it('allows the same destination under two HQs, each with its own name', async () => {
    await createRoute();
    hqRow = { ...hqRow, id: 'hq-2', name: 'SLG-2' };
    await expect(createRoute({ hqId: 'hq-2' })).resolves.toMatchObject({ hqId: 'hq-2', name: 'SLG-2 to Naxalbari' });
  });
});

describe('editing a route', () => {
  it('keeps a new km and the TA rate', async () => {
    const route = await createRoute({ taPerKmRateOverridePaise: 450 });
    expect(await updateRoute().execute(route.id, { distanceKm: '40.00' })).toMatchObject({ distanceKm: '40.00', taPerKmRateOverridePaise: 450 });
  });

  it('can set a km on a migrated route that has none', async () => {
    const route = await createRoute();
    routes.rows.set(route.id, { ...routes.rows.get(route.id)!, distanceKm: null });
    expect(await updateRoute().execute(route.id, { distanceKm: '18.50' })).toMatchObject({ distanceKm: '18.50' });
  });

  it("refuses a name or type change on a route between places: they come from the places", async () => {
    const route = await createRoute();
    await expect(updateRoute().execute(route.id, { type: 'OUT_STATION' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateRoute().execute(route.id, { destinationName: 'Matigara' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a route not yet migrated: a new destination re-makes the name, and one the HQ already has is refused', async () => {
    const route = await legacyRoute();
    await legacyRoute('Dhupguri');
    expect(await updateRoute().execute(route.id, { destinationName: 'Matigara' })).toMatchObject({ name: 'SLG-1 to Matigara', distanceKm: '12.35' });
    await expect(updateRoute().execute(route.id, { destinationName: 'dhupguri' })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('HQ deactivation', () => {
  it('is refused while the HQ has an active route or place, allowed once they are inactive; the HQ town follows', async () => {
    const route = await createRoute();

    await expect(updateHq().execute(hqRow.id, { status: 'inactive' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { activeChildren: 1 },
    });
    await updateRoute().execute(route.id, { status: 'inactive' });
    await expect(updateHq().execute(hqRow.id, { status: 'inactive' })).rejects.toMatchObject({ statusCode: 409 });
    await new UpdatePlaceUseCase(places, hqs, routes, placeRoutes).execute(route.toPlaceId!, { status: 'inactive' });
    await expect(updateHq().execute(hqRow.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
    expect(await places.findHqTown(hqRow.id)).toMatchObject({ status: 'inactive' });
  });
});

describe('renaming an HQ', () => {
  it('re-names its town and all its routes, active or not, migrated or not, and leaves the km alone', async () => {
    const a = await createRoute();
    const b = await createRoute({ destinationName: 'Dhupguri', distanceKm: '40.00' });
    const old = await legacyRoute('Matigara');
    await updateRoute().execute(b.id, { status: 'inactive' });

    await updateHq().execute(hqRow.id, { name: 'SLG-One' });

    expect(await places.findHqTown(hqRow.id)).toMatchObject({ name: 'SLG-One' });
    expect(routes.rows.get(a.id)).toMatchObject({ name: 'SLG-One to Naxalbari', distanceKm: '12.35' });
    expect(routes.rows.get(b.id)).toMatchObject({ name: 'SLG-One to Dhupguri', distanceKm: '40.00' });
    expect(routes.rows.get(old.id)).toMatchObject({ name: 'SLG-One to Matigara' });
  });

  it('does nothing to the routes when only the status changes', async () => {
    const a = await createRoute();
    await updateRoute().execute(a.id, { status: 'inactive' });
    await new UpdatePlaceUseCase(places, hqs, routes, placeRoutes).execute(a.toPlaceId!, { status: 'inactive' });
    await updateHq().execute(hqRow.id, { status: 'inactive' });
    expect(routes.rows.get(a.id)?.name).toBe('SLG-1 to Naxalbari');
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
    await updateRoute().execute(route.id, { status: 'inactive' });
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
    const update = updateRoute();

    await expect(update.execute(route.id, { status: 'inactive' })).rejects.toMatchObject({ statusCode: 409 });
    await new UnassignRouteUseCase(assignments).execute(route.id, 'mr-1', 'admin-1');
    await expect(update.execute(route.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });
});

describe('contract reads', () => {
  /** Where people are based (decision-log 2026-11-26): routes come from the HQ, not from assignments. */
  const based = (rows: Record<string, string>) =>
    ({
      findActiveForUsers: async (ids: string[]) => ids.filter((id) => rows[id]).map((id) => ({ userId: id, hqId: rows[id] })),
      listActiveInHqs: async (hqIds: string[]) => Object.entries(rows).filter(([, h]) => hqIds.includes(h)).map(([userId, hqId]) => ({ userId, hqId })),
    }) as never;
  const forUsers = (rows: Record<string, string>) => new ListRoutesForUsersUseCase(based(rows), routes, places, hqs);

  it("an employee's routes are every active route of their HQ, sorted, with the type that drives DA; nobody needs assigning", async () => {
    await createRoute({ destinationName: 'B route' });
    await createRoute({ destinationName: 'A route' });
    const ended = await createRoute({ destinationName: 'Ended route' });
    await updateRoute().execute(ended.id, { status: 'inactive' });

    const mine = await new ListRoutesForUserUseCase(forUsers({ 'mr-1': 'hq-1' })).execute('mr-1');
    expect(mine.map((r) => r.name)).toEqual(['SLG-1 to A route', 'SLG-1 to B route']);
    expect(mine[0]).toMatchObject({ hqName: 'SLG-1', routeType: 'EX_STATION', distanceKm: '12.35', distanceStatus: 'CALCULATED' });
    expect(await new ListRoutesForUserUseCase(forUsers({})).execute('mr-1')).toEqual([]);
  });

  it("a manager's plan gets the routes within their own HQ and their team's HQs, including a route across them, but not one into an HQ outside", async () => {
    otherHqs = [
      { id: 'hq-2', zoneId: 'zone-1', name: 'Jalpaiguri', status: 'active' },
      { id: 'hq-3', zoneId: 'zone-1', name: 'Malbazar', status: 'active' },
    ];
    const slg = await placeRoutes.ensureHqTown(hqRow);
    const jal = await placeRoutes.ensureHqTown(otherHqs[0]!);
    const mal = await placeRoutes.ensureHqTown(otherHqs[1]!);
    const maina = await rawPlace('hq-2', 'Mainaguri', 'EX_STATION');
    await newRoute().execute({ fromPlaceId: jal.id, toPlaceId: maina.id, distanceKm: '20' });
    await newRoute().execute({ fromPlaceId: slg.id, toPlaceId: maina.id, distanceKm: '65' });
    await newRoute().execute({ fromPlaceId: slg.id, toPlaceId: mal.id, distanceKm: '60' });

    const team = forUsers({ zsm: 'hq-1', mr: 'hq-2' });
    expect((await team.execute(['zsm', 'mr'])).map((r) => r.name)).toEqual(['Jalpaiguri to Mainaguri', 'SLG-1 to Mainaguri (Jalpaiguri)']);
    // The MR alone: only their own HQ.
    expect((await team.execute(['mr'])).map((r) => r.name)).toEqual(['Jalpaiguri to Mainaguri']);
  });

  it('who "holds" a route is everyone based in the HQ of either end', async () => {
    otherHqs = [{ id: 'hq-2', zoneId: 'zone-1', name: 'Jalpaiguri', status: 'active' }];
    const slg = await placeRoutes.ensureHqTown(hqRow);
    const maina = await rawPlace('hq-2', 'Mainaguri', 'EX_STATION');
    const cross = await newRoute().execute({ fromPlaceId: slg.id, toPlaceId: maina.id, distanceKm: '65' });
    const holders = await forUsers({ zsm: 'hq-1', mr: 'hq-2', other: 'hq-9' }).holders([cross.id]);
    expect(holders).toEqual([
      { routeId: cross.id, userId: 'zsm' },
      { routeId: cross.id, userId: 'mr' },
    ]);
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


describe('Route type from km (decision-log 2026-10-05), on the older create form', () => {
  it("a new destination's place takes its type from the km when none is given; an existing place keeps its own", async () => {
    expect(await createRoute({ type: undefined, distanceKm: '15' })).toMatchObject({ type: 'HQ', typeWarning: null });
    expect(await createRoute({ destinationName: 'B', type: undefined, distanceKm: '15.5' })).toMatchObject({ type: 'EX_STATION' });
    expect(await createRoute({ destinationName: 'C', type: undefined, distanceKm: '51' })).toMatchObject({ type: 'OUT_STATION' });
    expect(await places.findByName(hqRow.id, 'C')).toMatchObject({ type: 'OUT_STATION', isHqTown: false });
  });
});

describe('a route not yet migrated keeps the km-driven type rules', () => {
  it('an AUTO route follows a km edit, a MANUAL one does not (with a warning)', async () => {
    const auto = await legacyRoute('Auto', { type: 'HQ', typeSource: 'AUTO', distanceKm: '10' });
    const manual = await legacyRoute('Manual', { type: 'HQ', distanceKm: '10' });
    expect(await updateRoute().execute(auto.id, { distanceKm: '60' })).toMatchObject({ type: 'OUT_STATION', typeSource: 'AUTO' });
    const movedManual = await updateRoute().execute(manual.id, { distanceKm: '60' });
    expect(movedManual).toMatchObject({ type: 'HQ', typeSource: 'MANUAL' });
    expect(movedManual.typeWarning).toContain('suggests Out-station');
  });

  it('choosing a type makes it MANUAL; typeSource AUTO hands it back to the km', async () => {
    const route = await legacyRoute('X', { distanceKm: '30' });
    expect(await updateRoute().execute(route.id, { type: 'OUT_STATION' })).toMatchObject({ type: 'OUT_STATION', typeSource: 'MANUAL' });
    expect(await updateRoute().execute(route.id, { typeSource: 'AUTO' })).toMatchObject({ type: 'EX_STATION', typeSource: 'AUTO', typeWarning: null });
  });
});

describe('places and routes between them (decision-log 2026-11-26)', () => {
  const addPlace = (name: string, type: Place['type'], hqId = hqRow.id) => rawPlace(hqId, name, type);
  const town = () => placeRoutes.ensureHqTown(hqRow);
  const updatePlace = () => new UpdatePlaceUseCase(places, hqs, routes, placeRoutes);

  it('names a route "From to To", types it by the farther end, and stores the TA choice', async () => {
    const [from, to] = [await town(), await addPlace('Dhupguri', 'OUT_STATION')];
    const route = await newRoute().execute({ fromPlaceId: from.id, toPlaceId: to.id, distanceKm: '45', taFixedPaise: 20000 });
    expect(route).toMatchObject({
      hqId: 'hq-1',
      name: 'SLG-1 to Dhupguri',
      type: 'OUT_STATION',
      fromPlaceId: from.id,
      toPlaceId: to.id,
      taFixedPaise: 20000,
      taPerKmRateOverridePaise: null,
      typeWarning: null,
    });
  });

  it('one route per pair, whichever way round; never a place to itself; never both a rate and a fixed amount', async () => {
    const [a, b] = [await town(), await addPlace('Mainaguri', 'EX_STATION')];
    await newRoute().execute({ fromPlaceId: a.id, toPlaceId: b.id, distanceKm: '20' });
    await expect(newRoute().execute({ fromPlaceId: b.id, toPlaceId: a.id, distanceKm: '20' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(newRoute().execute({ fromPlaceId: a.id, toPlaceId: a.id, distanceKm: '1' })).rejects.toMatchObject({ statusCode: 400 });
    const c = await addPlace('Chalsa', 'EX_STATION');
    await expect(
      newRoute().execute({ fromPlaceId: a.id, toPlaceId: c.id, distanceKm: '5', taPerKmRateOverridePaise: 400, taFixedPaise: 100 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a route into another HQ is out-station and names that HQ in brackets, but not for an HQ town', async () => {
    otherHqs = [{ id: 'hq-2', zoneId: 'zone-1', name: 'Jalpaiguri', status: 'active' }];
    const mainaguri = await addPlace('Mainaguri', 'EX_STATION', 'hq-2');
    const jalpaiguri = await placeRoutes.ensureHqTown(otherHqs[0]!);
    const from = await town();
    expect(await newRoute().execute({ fromPlaceId: from.id, toPlaceId: mainaguri.id, distanceKm: '65' })).toMatchObject({
      name: 'SLG-1 to Mainaguri (Jalpaiguri)',
      type: 'OUT_STATION',
    });
    expect(await newRoute().execute({ fromPlaceId: from.id, toPlaceId: jalpaiguri.id, distanceKm: '45' })).toMatchObject({ name: 'SLG-1 to Jalpaiguri' });
  });

  it('renaming or re-typing a place re-makes its routes; the HQ town itself cannot be edited', async () => {
    const [from, to] = [await town(), await addPlace('Naxal', 'HQ')];
    const route = await newRoute().execute({ fromPlaceId: from.id, toPlaceId: to.id, distanceKm: '25' });
    await updatePlace().execute(to.id, { name: 'Naxalbari', type: 'EX_STATION' });
    expect(routes.rows.get(route.id)).toMatchObject({ name: 'SLG-1 to Naxalbari', destinationName: 'Naxalbari', type: 'EX_STATION' });
    await expect(updatePlace().execute(from.id, { name: 'Other' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a place with an active route cannot be deactivated; a route cannot come back while a place is inactive', async () => {
    const [from, to] = [await town(), await addPlace('Naxalbari', 'EX_STATION')];
    const route = await newRoute().execute({ fromPlaceId: from.id, toPlaceId: to.id, distanceKm: '25' });
    await expect(updatePlace().execute(to.id, { status: 'inactive' })).rejects.toMatchObject({ statusCode: 409 });
    await updateRoute().execute(route.id, { status: 'inactive' });
    await updatePlace().execute(to.id, { status: 'inactive' });
    await expect(updateRoute().execute(route.id, { status: 'active' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('setting a fixed amount clears the rate per km, and the other way round', async () => {
    const [from, to] = [await town(), await addPlace('Naxalbari', 'EX_STATION')];
    const route = await newRoute().execute({ fromPlaceId: from.id, toPlaceId: to.id, distanceKm: '25', taPerKmRateOverridePaise: 400 });
    expect(await updateRoute().execute(route.id, { taFixedPaise: 15000 })).toMatchObject({ taFixedPaise: 15000, taPerKmRateOverridePaise: null });
    expect(await updateRoute().execute(route.id, { taPerKmRateOverridePaise: 500 })).toMatchObject({ taFixedPaise: null, taPerKmRateOverridePaise: 500 });
  });
});

describe('importing routes from a CSV (decision-log 2026-11-26)', () => {
  const row = (line: number, over: Partial<RouteImportRow> = {}): RouteImportRow => ({
    line,
    fromHq: 'SLG-1',
    fromPlace: undefined,
    fromType: undefined,
    toHq: 'SLG-1',
    toPlace: 'Naxalbari',
    toType: 'EX_STATION',
    distanceKm: '25',
    taPerKmRateOverridePaise: null,
    taFixedPaise: null,
    ...over,
  });
  const importer = () => new ImportRoutesUseCase(hqs, places, routes, placeRoutes);

  beforeEach(async () => {
    otherHqs = [{ id: 'hq-2', zoneId: 'zone-1', name: 'Jalpaiguri', status: 'active' }];
    await placeRoutes.ensureHqTown(hqRow);
    await placeRoutes.ensureHqTown(otherHqs[0]!);
  });

  it('a dry run writes nothing; the real run makes the missing places and the routes, across HQs', async () => {
    const rows = [row(2), row(3, { toHq: 'Jalpaiguri', toPlace: 'Mainaguri', toType: 'EX_STATION', distanceKm: '65', taFixedPaise: 30000 })];
    const dry = await importer().execute(rows, { dryRun: true });
    expect(dry.created).toEqual({ places: ['SLG-1 / Naxalbari', 'Jalpaiguri / Mainaguri'], routes: ['SLG-1 to Naxalbari', 'SLG-1 to Mainaguri (Jalpaiguri)'] });
    expect(routes.rows.size).toBe(0);

    await importer().execute(rows, { dryRun: false });
    expect([...routes.rows.values()].map((r) => [r.name, r.distanceKm, r.taFixedPaise, r.type])).toEqual([
      ['SLG-1 to Naxalbari', '25', null, 'EX_STATION'],
      ['SLG-1 to Mainaguri (Jalpaiguri)', '65', 30000, 'OUT_STATION'],
    ]);
  });

  it('is safe to repeat: the same km is skipped, a different km is a problem, and nothing is written on a problem', async () => {
    await importer().execute([row(2)], { dryRun: false });
    expect((await importer().execute([row(2)], { dryRun: false })).existing).toEqual({ routes: 1 });
    await expect(importer().execute([row(2, { distanceKm: '30' }), row(3, { toPlace: 'Matigara' })], { dryRun: false })).rejects.toMatchObject({
      statusCode: 400,
      publicDetails: { errors: [{ line: 2, message: 'SLG-1 to Naxalbari already exists with 25 km. Change it in the app.' }] },
    });
    expect(await places.findByName(hqRow.id, 'Matigara')).toBeNull();
  });

  it('lists an unknown HQ, a new place without a type and a pair given twice (either way round)', async () => {
    const result = importer().execute(
      [
        row(2, { fromHq: 'Nowhere' }),
        row(3, { toPlace: 'Dhupguri', toType: undefined }),
        row(4),
        row(5, { fromPlace: 'Naxalbari', fromType: 'EX_STATION', toPlace: undefined }),
      ],
      { dryRun: true },
    );
    await expect(result).rejects.toMatchObject({
      publicDetails: {
        errors: [
          { line: 2, message: 'No HQ called "Nowhere".' },
          { line: 3, message: '"Dhupguri" is not a place of SLG-1 yet. Give to_type (HQ, EX or OUT) to create it.' },
          { line: 5, message: 'Naxalbari ↔ SLG-1 is in the file twice (a route serves both ways).' },
        ],
      },
    });
  });
});

describe('the Territory page (2026-11-27)', () => {
  const create = () => new CreatePlaceUseCase(places, hqs, (input) => newRoute().execute(input));

  it('a place always comes with its km from the HQ town: one save makes the place and that route, with its TA', async () => {
    await placeRoutes.ensureHqTown(hqRow);
    const made = await create().execute({ hqId: hqRow.id, name: 'Naxalbari', type: 'EX_STATION', distanceKm: '25', taFixedPaise: 35000 });
    expect(made).toMatchObject({ name: 'Naxalbari' });
    expect(routes.rows.get(made.routeId)).toMatchObject({ name: 'SLG-1 to Naxalbari', distanceKm: '25', taFixedPaise: 35000 });
  });

  it('checks first, and if the route still fails no place is left behind', async () => {
    await expect(create().execute({ hqId: hqRow.id, name: 'Rangapani', type: 'EX_STATION', distanceKm: '10' })).rejects.toMatchObject({ statusCode: 409 });
    await placeRoutes.ensureHqTown(hqRow);
    await expect(
      create().execute({ hqId: hqRow.id, name: 'Rangapani', type: 'EX_STATION', distanceKm: '10', taFixedPaise: 100, taPerKmRateOverridePaise: 400 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const failing = new CreatePlaceUseCase(places, hqs, async () => {
      throw new Error('boom');
    });
    await expect(failing.execute({ hqId: hqRow.id, name: 'Matigara', type: 'HQ', distanceKm: '8' })).rejects.toThrow('boom');
    expect(await places.findByName(hqRow.id, 'Matigara')).toBeNull();
    expect(await places.findByName(hqRow.id, 'Rangapani')).toBeNull();
  });

  it('lists the places that still have no route to their HQ town (older data)', async () => {
    await placeRoutes.ensureHqTown(hqRow);
    await create().execute({ hqId: hqRow.id, name: 'Naxalbari', type: 'EX_STATION', distanceKm: '25' });
    await rawPlace(hqRow.id, 'Rangapani', 'EX_STATION');
    const missing = await new ListPlacesUseCase(places, routes).execute({ page: 1, pageSize: 20, missingHqTownRoute: true });
    expect(missing.items.map((p) => p.name)).toEqual(['Rangapani']);
  });
});
