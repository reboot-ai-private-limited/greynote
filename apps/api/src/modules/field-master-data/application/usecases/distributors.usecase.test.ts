import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { RemoveDistributorDocumentUseCase, UploadDistributorDocumentUseCase } from './distributorDocuments.usecase.js';
import { coverageMeets, expandRouteIds, scopeOfUser } from '../distributorCoverage.js';
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
  zoneIds: [],
  hqIds: [],
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

  it('creates an active Distributor over zones, HQs and routes, handed to any field employees', async () => {
    expect(await create({ routeIds: ['route-1', 'route-2'] })).toMatchObject({ status: 'active', routeIds: ['route-1', 'route-2'], assignedUserIds: ['mr1', 'asm'], documents: [] });
    expect(await create({ zoneIds: ['z1', 'z2'], hqIds: [], routeIds: [] })).toMatchObject({ zoneIds: ['z1', 'z2'] }); // more than one zone, nothing narrower
    expect(await create({ zoneIds: [], hqIds: ['h1'], routeIds: [] })).toMatchObject({ hqIds: ['h1'] }); // an HQ alone is all its routes
    expect((await create({ name: 'Unassigned', assignedUserIds: [] })).assignedUserIds).toEqual([]);
  });

  it('refuses no coverage, an unknown or inactive zone / HQ / route, and people who are not active FIELD employees', async () => {
    await expectStatus(create({ routeIds: [] }), 400);
    await expectStatus(create({ routeIds: ['route-x'] }), 404);
    await expectStatus(create({ routeIds: ['route-off'] }), 409);
    await expectStatus(create({ zoneIds: ['z-x'], routeIds: [] }), 404);
    await expectStatus(create({ zoneIds: ['z-off'], routeIds: [] }), 409);
    await expectStatus(create({ hqIds: ['h-x'], routeIds: [] }), 404);
    await expectStatus(create({ hqIds: ['h-off'], routeIds: [] }), 409);
    await expectStatus(create({ assignedUserIds: ['admin'] }), 400);
    await expectStatus(create({ assignedUserIds: ['mr1', 'nobody'] }), 400);
    await expectStatus(create({ assignedUserIds: ['gone'] }), 409);
    expect(distributors.rows).toHaveLength(0);
  });

  it('changes coverage and people, and deactivates — checking only who and what is newly added', async () => {
    const d = await create();
    const edit = new UpdateDistributorUseCase(distributors, territory, users);
    expect((await edit.execute(d.id, { assignedUserIds: ['mr1', 'mr2'] })).assignedUserIds).toEqual(['mr1', 'mr2']);
    expect((await edit.execute(d.id, { assignedUserIds: [] })).assignedUserIds).toEqual([]);
    expect((await edit.execute(d.id, { routeIds: ['route-2', 'route-1'] })).routeIds).toEqual(['route-2', 'route-1']);
    expect((await edit.execute(d.id, { zoneIds: ['z2'], hqIds: ['h1'], routeIds: [] })).zoneIds).toEqual(['z2']);
    await expectStatus(edit.execute(d.id, { routeIds: ['route-1', 'route-off'] }), 409);
    await expectStatus(edit.execute(d.id, { zoneIds: [], hqIds: [], routeIds: [] }), 400); // would leave it covering nothing
    await expectStatus(edit.execute(d.id, { assignedUserIds: ['gone'] }), 409);
    await edit.execute(d.id, { assignedUserIds: ['mr2'] });
    users.rows.find((u) => u.id === 'mr2')!.status = 'inactive';
    expect((await edit.execute(d.id, { assignedUserIds: ['mr2'], name: 'Renamed' })).name).toBe('Renamed'); // already theirs
    expect((await edit.execute(d.id, { status: 'inactive' })).status).toBe('inactive');
    await expectStatus(edit.execute('nope', { name: 'x' }), 404);
  });

  it('keeps an HQ that has since gone inactive until Admin changes it', async () => {
    const d = await create({ hqIds: ['h1'], routeIds: [] });
    territory.hqs.set('h1', { zoneId: 'z1', status: 'inactive' });
    const edit = new UpdateDistributorUseCase(distributors, territory, users);
    expect((await edit.execute(d.id, { name: 'Renamed' })).name).toBe('Renamed');
    expect((await edit.execute(d.id, { hqIds: ['h1'], zoneIds: ['z2'] })).zoneIds).toEqual(['z2']); // h1 is already there
  });

  it('a zone alone covers every route in it, an HQ alone every route of that HQ, and routes only themselves', async () => {
    territory.userRoutes.set('u-z1', ['route-1']);
    territory.userRoutes.set('u-z2', ['route-3']);
    const zoneWide = await create({ name: 'Zone wide', zoneIds: ['z1'], routeIds: [] });
    const hqWide = await create({ name: 'HQ wide', hqIds: ['h1'], routeIds: [] });
    const one = await create({ name: 'One route', routeIds: ['route-2'] });
    const meets = async (d: typeof zoneWide, userId: string) => coverageMeets(d, await scopeOfUser(territory, userId));
    expect([await meets(zoneWide, 'u-z1'), await meets(hqWide, 'u-z1'), await meets(one, 'u-z1')]).toEqual([true, true, false]);
    expect([await meets(zoneWide, 'u-z2'), await meets(hqWide, 'u-z2'), await meets(one, 'u-z2')]).toEqual([false, false, false]);
    expect((await expandRouteIds(territory, zoneWide)).sort()).toEqual(['route-1', 'route-2']);
    expect((await expandRouteIds(territory, { zoneIds: [], hqIds: ['h2'], routeIds: ['route-1'] })).sort()).toEqual(['route-1', 'route-3']);
    expect((await distributors.listActiveForUser('u-z1', await scopeOfUser(territory, 'u-z1'))).map((x) => x.name).sort()).toEqual(['HQ wide', 'Zone wide'].sort());
  });

  it('attaches several documents, refuses a file that is not a PDF, JPG or PNG, and removes one with its file', async () => {
    const d = await create();
    const stored: string[] = [];
    const storage = {
      upload: async () => ({ url: 'https://files/x', publicId: `pid-${stored.length}` }),
      remove: async (publicId: string) => void stored.push(publicId),
    };
    const upload = new UploadDistributorDocumentUseCase(distributors, storage);
    const pdf = Buffer.from('%PDF-1.4 hello');
    const first = await upload.execute(d.id, 'DRUG_LICENCE', pdf);
    await upload.execute(d.id, 'DRUG_LICENCE', pdf);
    expect(distributors.rows[0]!.documents).toHaveLength(2);
    await expectStatus(upload.execute(d.id, 'PAN', Buffer.from('just text')), 400);
    await expectStatus(upload.execute(d.id, 'PAN', undefined), 400);
    await expectStatus(upload.execute('nope', 'PAN', pdf), 404);
    const remove = new RemoveDistributorDocumentUseCase(distributors, storage);
    await remove.execute(d.id, first.id);
    expect(distributors.rows[0]!.documents).toHaveLength(1);
    expect(stored).toEqual([first.publicId]);
    await expectStatus(remove.execute(d.id, first.id), 404);
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

  it('lists by route, HQ or zone (a wider distributor serves what is under it), by assigned person, and by name or GST', async () => {
    await create({ routeIds: ['route-1', 'route-2'] });
    await create({ routeIds: ['route-2'], name: 'City Agencies', gstNumber: '19AAAAA1111A1Z1', assignedUserIds: ['mr2'] });
    await create({ routeIds: ['route-3'], name: 'Far Away Co', gstNumber: '27BBBBB2222B1Z2', assignedUserIds: [] });
    await create({ routeIds: [], zoneIds: ['z1'], name: 'Whole Zone', gstNumber: '19CCCCC3333C1Z3', assignedUserIds: [] });
    const list = new ListDistributorsUseCase(distributors, territory);
    const names = async (q: Record<string, string>) => (await list.execute({ ...page, ...q })).items.map((d) => d.name).sort();
    expect(await names({ routeId: 'route-2' })).toEqual(['City Agencies', 'Shree Distributors', 'Whole Zone']);
    expect(await names({ routeId: 'route-1' })).toEqual(['Shree Distributors', 'Whole Zone']);
    expect(await names({ hqId: 'h1' })).toEqual(['City Agencies', 'Shree Distributors', 'Whole Zone']);
    expect(await names({ zoneId: 'z2' })).toEqual(['Far Away Co']);
    expect(await names({ zoneId: 'z1' })).toEqual(['City Agencies', 'Shree Distributors', 'Whole Zone']);
    expect(await names({ hqId: 'nowhere' })).toEqual([]);
    expect(await names({ assignedUserId: 'mr2' })).toEqual(['City Agencies']);
    expect(await names({ search: '27bbb' })).toEqual(['Far Away Co']);
    expect((await list.execute(page)).total).toBe(4);
  });
});
