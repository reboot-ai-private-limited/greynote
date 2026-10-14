import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { CreateDistributorUseCase, type CreateDistributorInput } from './createDistributor.usecase.js';
import { FakeDistributors, FakeTerritory, FakeUsers } from './fmdTestKit.js';
import { GetDistributorUseCase } from './getDistributor.usecase.js';
import { ListDistributorsUseCase } from './listDistributors.usecase.js';
import { UpdateDistributorUseCase } from './updateDistributor.usecase.js';

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

const page = { page: 1, pageSize: 20 };
const input: CreateDistributorInput = {
  routeIds: ['route-1'],
  name: 'Shree Distributors',
  gstNumber: '19ABCDE1234F1Z5',
  contactPerson: 'R. Shah',
  mobile: '9876543210',
  address: '1 Market Rd',
  location: null,
  assignedUserIds: ['mr1', 'asm'],
  openingDuesPaise: 0,
};

describe('Distributors', () => {
  let distributors: FakeDistributors;
  let territory: FakeTerritory;
  let users: FakeUsers;
  const create = (over: Partial<CreateDistributorInput> = {}) => new CreateDistributorUseCase(distributors, territory, users).execute({ ...input, ...over });

  beforeEach(() => {
    distributors = new FakeDistributors();
    territory = new FakeTerritory();
    users = new FakeUsers();
  });

  it('creates an active Distributor on several routes of one zone, handed to any field employees', async () => {
    expect(await create({ routeIds: ['route-1', 'route-2'] })).toMatchObject({ status: 'active', routeIds: ['route-1', 'route-2'], assignedUserIds: ['mr1', 'asm'] });
    expect((await create({ name: 'Unassigned', assignedUserIds: [] })).assignedUserIds).toEqual([]);
  });

  it('refuses no route, an unknown or inactive route, routes in different zones, and people who are not active FIELD employees', async () => {
    await expectStatus(create({ routeIds: [] }), 400);
    await expectStatus(create({ routeIds: ['route-x'] }), 404);
    await expectStatus(create({ routeIds: ['route-off'] }), 409);
    await expectStatus(create({ routeIds: ['route-1', 'route-3'] }), 400); // z1 and z2
    await expectStatus(create({ assignedUserIds: ['admin'] }), 400);
    await expectStatus(create({ assignedUserIds: ['mr1', 'nobody'] }), 400);
    await expectStatus(create({ assignedUserIds: ['gone'] }), 409);
    expect(distributors.rows).toHaveLength(0);
  });

  it('changes routes and people, and deactivates — checking only who and what is newly added', async () => {
    const d = await create();
    const edit = new UpdateDistributorUseCase(distributors, territory, users);
    expect((await edit.execute(d.id, { assignedUserIds: ['mr1', 'mr2'] })).assignedUserIds).toEqual(['mr1', 'mr2']);
    expect((await edit.execute(d.id, { assignedUserIds: [] })).assignedUserIds).toEqual([]);
    expect((await edit.execute(d.id, { routeIds: ['route-2', 'route-1'] })).routeIds).toEqual(['route-2', 'route-1']);
    await expectStatus(edit.execute(d.id, { routeIds: ['route-1', 'route-off'] }), 409);
    await expectStatus(edit.execute(d.id, { routeIds: ['route-1', 'route-3'] }), 400);
    await expectStatus(edit.execute(d.id, { assignedUserIds: ['gone'] }), 409);
    await edit.execute(d.id, { assignedUserIds: ['mr2'] });
    users.rows.find((u) => u.id === 'mr2')!.status = 'inactive';
    expect((await edit.execute(d.id, { assignedUserIds: ['mr2'], name: 'Renamed' })).name).toBe('Renamed'); // already theirs
    expect((await edit.execute(d.id, { status: 'inactive' })).status).toBe('inactive');
    await expectStatus(edit.execute('nope', { name: 'x' }), 404);
  });

  it('the detail carries the place of each Route, resolved through Territory', async () => {
    const d = await create({ routeIds: ['route-1', 'route-2'] });
    const detail = await new GetDistributorUseCase(distributors, territory).execute(d.id);
    expect(detail.paths).toEqual([
      { routeId: 'route-1', routeType: 'HQ', hqId: 'h1', zoneId: 'z1' },
      { routeId: 'route-2', routeType: 'HQ', hqId: 'h1', zoneId: 'z1' },
    ]);
    await expectStatus(new GetDistributorUseCase(distributors, territory).execute('nope'), 404);
  });

  it('lists by route (any of its routes), by the HQ / zone above, by assigned person, and by name or GST', async () => {
    await create({ routeIds: ['route-1', 'route-2'] });
    await create({ routeIds: ['route-2'], name: 'City Agencies', gstNumber: '19AAAAA1111A1Z1', assignedUserIds: ['mr2'] });
    await create({ routeIds: ['route-3'], name: 'Far Away Co', gstNumber: '27BBBBB2222B1Z2', assignedUserIds: [] });
    const list = new ListDistributorsUseCase(distributors, territory);
    const names = async (q: Record<string, string>) => (await list.execute({ ...page, ...q })).items.map((d) => d.name).sort();
    expect(await names({ routeId: 'route-2' })).toEqual(['City Agencies', 'Shree Distributors']);
    expect(await names({ routeId: 'route-1' })).toEqual(['Shree Distributors']);
    expect(await names({ hqId: 'h1' })).toEqual(['City Agencies', 'Shree Distributors']);
    expect(await names({ zoneId: 'z2' })).toEqual(['Far Away Co']);
    expect(await names({ hqId: 'h1', routeId: 'route-3' })).toEqual([]); // the route isn't under that HQ
    expect(await names({ hqId: 'nowhere' })).toEqual([]);
    expect(await names({ assignedUserId: 'mr2' })).toEqual(['City Agencies']);
    expect(await names({ search: '27bbb' })).toEqual(['Far Away Co']);
    expect((await list.execute(page)).total).toBe(3);
  });
});
