import { beforeEach, describe, expect, it } from 'vitest';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
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
import { UpdateHqUseCase } from './updateHq.usecase.js';
import { UpdateRouteUseCase } from './updateRoute.usecase.js';
import { UnassignRouteUseCase } from './unassignRoute.usecase.js';
import { RouteTypeRules } from './routeTypeRules.js';
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
const users: UserDirectoryPort = {
  findUserSummary: async (id) => USERS.find((u) => u.id === id) ?? null,
  recordUserTerritory: async () => undefined,
};

let hqRow: Hq;
const hqs = {
  findById: async (id: string) => (id === hqRow.id ? hqRow : null),
  findByIds: async (ids: string[]) => (ids.includes(hqRow.id) ? [hqRow] : []),
  findByName: async () => null,
  update: async (_id: string, input: Partial<Hq>) => (hqRow = { ...hqRow, ...input }),
} as unknown as HqRepositoryPort;
const zones = { findById: async () => ({ id: 'zone-1', name: 'West Bengal', status: 'active' }) } as unknown as ZoneRepositoryPort;

let routes: FakeRoutes;
let assignments: FakeAssignments;

beforeEach(() => {
  hqRow = { id: 'hq-1', zoneId: 'zone-1', name: 'SLG-1', status: 'active' };
  routes = new FakeRoutes();
  assignments = new FakeAssignments();
});

const createRoute = (overrides: Partial<Parameters<CreateRouteUseCase['execute']>[0]> = {}) =>
  new CreateRouteUseCase(routes, hqs, typeRules).execute({
    hqId: hqRow.id,
    destinationName: 'Naxalbari',
    distanceKm: '12.35',
    type: 'EX_STATION',
    ...overrides,
  });
const updateRoute = () => new UpdateRouteUseCase(routes, hqs, assignments, typeRules);


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
  it('a new destination re-makes the name, and refuses one the HQ already has', async () => {
    const route = await createRoute();
    await createRoute({ destinationName: 'Dhupguri' });
    expect(await updateRoute().execute(route.id, { destinationName: 'Matigara' })).toMatchObject({
      name: 'SLG-1 to Matigara',
      destinationName: 'Matigara',
      distanceKm: '12.35',
    });
    await expect(updateRoute().execute(route.id, { destinationName: 'dhupguri' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('a new km is kept, and the TA rate survives a destination and km edit', async () => {
    const route = await createRoute({ taPerKmRateOverridePaise: 450 });
    const edited = await updateRoute().execute(route.id, { destinationName: 'Dhupguri', distanceKm: '40.00' });
    expect(edited).toMatchObject({ distanceKm: '40.00', taPerKmRateOverridePaise: 450 });
  });

  it('can set a km on a migrated route that has none', async () => {
    const route = await createRoute();
    routes.rows.set(route.id, { ...routes.rows.get(route.id)!, distanceKm: null });
    expect(await updateRoute().execute(route.id, { distanceKm: '18.50' })).toMatchObject({ distanceKm: '18.50' });
  });
});

describe('HQ deactivation', () => {
  it('is refused while the HQ has an active route, allowed once it is inactive', async () => {
    const route = await createRoute();
    const updateHq = new UpdateHqUseCase(hqs, zones, routes);

    await expect(updateHq.execute(hqRow.id, { status: 'inactive' })).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { activeChildren: 1 },
    });
    await updateRoute().execute(route.id, { status: 'inactive' });
    await expect(updateHq.execute(hqRow.id, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });
});

describe('renaming an HQ', () => {
  it('re-names all its routes, active or not, and leaves the km alone', async () => {
    const a = await createRoute();
    const b = await createRoute({ destinationName: 'Dhupguri', distanceKm: '40.00' });
    await updateRoute().execute(b.id, { status: 'inactive' });

    await new UpdateHqUseCase(hqs, zones, routes).execute(hqRow.id, { name: 'SLG-One' });

    expect(routes.rows.get(a.id)).toMatchObject({ name: 'SLG-One to Naxalbari', distanceKm: '12.35' });
    expect(routes.rows.get(b.id)).toMatchObject({ name: 'SLG-One to Dhupguri', distanceKm: '40.00' });
  });

  it('does nothing to the routes when only the status changes', async () => {
    const a = await createRoute();
    await updateRoute().execute(a.id, { status: 'inactive' });
    await new UpdateHqUseCase(hqs, zones, routes).execute(hqRow.id, { status: 'inactive' });
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
  it("lists an employee's active routes with the type that drives DA, sorted by name", async () => {
    const b = await createRoute({ destinationName: 'B route' });
    const a = await createRoute({ destinationName: 'A route' });
    const ended = await createRoute({ destinationName: 'Ended route' });
    const assign = new AssignRouteUseCase(routes, assignments, users);
    for (const r of [b, a, ended]) await assign.execute(r.id, 'mr-1', 'admin-1');
    await new UnassignRouteUseCase(assignments).execute(ended.id, 'mr-1', 'admin-1');

    const mine = await new ListRoutesForUserUseCase(assignments, routes, hqs).execute('mr-1');
    expect(mine.map((r) => r.name)).toEqual(['SLG-1 to A route', 'SLG-1 to B route']);
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


describe('Route type from km (decision-log 2026-10-05)', () => {
  const noType = (overrides: Partial<Parameters<CreateRouteUseCase['execute']>[0]> = {}) => createRoute({ type: undefined, ...overrides });

  it('a Route created without a type takes it from the km, as AUTO', async () => {
    expect(await noType({ distanceKm: '15' })).toMatchObject({ type: 'HQ', typeSource: 'AUTO', typeWarning: null });
    expect(await noType({ destinationName: 'B', distanceKm: '15.5' })).toMatchObject({ type: 'EX_STATION', typeSource: 'AUTO' });
    expect(await noType({ destinationName: 'C', distanceKm: '51' })).toMatchObject({ type: 'OUT_STATION', typeSource: 'AUTO' });
  });

  it('a chosen type is kept as MANUAL; if the km disagrees there is a warning and no refusal', async () => {
    const route = await createRoute({ type: 'HQ', distanceKm: '30' });
    expect(route).toMatchObject({ type: 'HQ', typeSource: 'MANUAL' });
    expect(route.typeWarning).toContain('suggests Ex-station');
    expect((await createRoute({ destinationName: 'Agrees', type: 'EX_STATION', distanceKm: '30' })).typeWarning).toBeNull();
  });

  it('an AUTO Route follows a km edit, a MANUAL one does not', async () => {
    const auto = await noType({ distanceKm: '10' });
    const manual = await createRoute({ destinationName: 'Manual', type: 'HQ', distanceKm: '10' });
    const movedAuto = await updateRoute().execute(auto.id, { distanceKm: '60' });
    const movedManual = await updateRoute().execute(manual.id, { distanceKm: '60' });
    expect(movedAuto).toMatchObject({ type: 'OUT_STATION', typeSource: 'AUTO' });
    expect(movedManual).toMatchObject({ type: 'HQ', typeSource: 'MANUAL' });
    expect(movedManual.typeWarning).toContain('suggests Out-station');
  });

  it('choosing a type makes a Route MANUAL; typeSource AUTO hands it back to the km', async () => {
    const route = await noType({ distanceKm: '30' });
    expect(await updateRoute().execute(route.id, { type: 'OUT_STATION' })).toMatchObject({ type: 'OUT_STATION', typeSource: 'MANUAL' });
    expect(await updateRoute().execute(route.id, { typeSource: 'AUTO' })).toMatchObject({ type: 'EX_STATION', typeSource: 'AUTO', typeWarning: null });
  });

  it('a type change leaves the km alone', async () => {
    const route = await createRoute();
    expect(await updateRoute().execute(route.id, { type: 'OUT_STATION' })).toMatchObject({ type: 'OUT_STATION', distanceKm: '12.35' });
  });
});
