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
  routeId: 'route-1',
  name: 'Shree Distributors',
  gstNumber: '19ABCDE1234F1Z5',
  contactPerson: 'R. Shah',
  mobile: '9876543210',
  address: '1 Market Rd',
  location: null,
  assignedMrId: 'mr1',
  assignedAsmId: 'asm',
  primarySalesEnabled: true,
  secondarySalesEnabled: false,
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

  it('creates an active Distributor on an active route with its MR and ASM', async () => {
    expect(await create()).toMatchObject({ status: 'active', assignedMrId: 'mr1', assignedAsmId: 'asm', primarySalesEnabled: true, secondarySalesEnabled: false });
    expect((await create({ name: 'Unassigned', assignedMrId: null, assignedAsmId: null })).assignedMrId).toBeNull();
  });

  it('refuses an unknown or inactive route, and an MR / ASM who is not an active FIELD employee', async () => {
    await expectStatus(create({ routeId: 'route-x' }), 404);
    await expectStatus(create({ routeId: 'route-off' }), 409);
    await expectStatus(create({ assignedMrId: 'admin' }), 400);
    await expectStatus(create({ assignedAsmId: 'nobody' }), 400);
    await expectStatus(create({ assignedMrId: 'gone' }), 409);
    expect(distributors.rows).toHaveLength(0);
  });

  it('reassigns, clears, moves and deactivates — checking only who is newly put in charge', async () => {
    const d = await create();
    const edit = new UpdateDistributorUseCase(distributors, territory, users);
    expect((await edit.execute(d.id, { assignedMrId: 'mr2' })).assignedMrId).toBe('mr2');
    expect((await edit.execute(d.id, { assignedAsmId: null })).assignedAsmId).toBeNull();
    expect((await edit.execute(d.id, { routeId: 'route-2' })).routeId).toBe('route-2');
    await expectStatus(edit.execute(d.id, { routeId: 'route-off' }), 409);
    await expectStatus(edit.execute(d.id, { assignedMrId: 'gone' }), 409);
    users.rows.find((u) => u.id === 'mr2')!.status = 'inactive';
    expect((await edit.execute(d.id, { assignedMrId: 'mr2', name: 'Renamed' })).name).toBe('Renamed'); // already theirs
    expect((await edit.execute(d.id, { status: 'inactive' })).status).toBe('inactive');
    await expectStatus(edit.execute('nope', { name: 'x' }), 404);
  });

  it('the detail carries the breadcrumb resolved through the Route', async () => {
    const d = await create();
    const detail = await new GetDistributorUseCase(distributors, territory).execute(d.id);
    expect(detail.path).toEqual({ routeId: 'route-1', areaId: 'a1', areaType: 'HQ', hqId: 'h1', zoneId: 'z1' });
    await expectStatus(new GetDistributorUseCase(distributors, territory).execute('nope'), 404);
  });

  it('lists by route, by the area / HQ / zone above it, by MR, and by name or GST', async () => {
    await create();
    await create({ routeId: 'route-2', name: 'City Agencies', gstNumber: '19AAAAA1111A1Z1', assignedMrId: 'mr2' });
    await create({ routeId: 'route-3', name: 'Far Away Co', gstNumber: '27BBBBB2222B1Z2', assignedMrId: null });
    const list = new ListDistributorsUseCase(distributors, territory);
    const names = async (q: Record<string, string>) => (await list.execute({ ...page, ...q })).items.map((d) => d.name).sort();
    expect(await names({ routeId: 'route-2' })).toEqual(['City Agencies']);
    expect(await names({ hqId: 'h1' })).toEqual(['City Agencies', 'Shree Distributors']);
    expect(await names({ zoneId: 'z2' })).toEqual(['Far Away Co']);
    expect(await names({ areaId: 'a1' })).toEqual(['Shree Distributors']);
    expect(await names({ hqId: 'h1', routeId: 'route-3' })).toEqual([]); // the route isn't under that HQ
    expect(await names({ hqId: 'nowhere' })).toEqual([]);
    expect(await names({ assignedMrId: 'mr2' })).toEqual(['City Agencies']);
    expect(await names({ search: '27bbb' })).toEqual(['Far Away Co']);
    expect((await list.execute(page)).total).toBe(3);
  });
});
