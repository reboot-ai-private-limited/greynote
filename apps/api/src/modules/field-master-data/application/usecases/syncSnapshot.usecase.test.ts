import { beforeEach, describe, expect, it } from 'vitest';
import { makeFieldMasterDataSource } from '../syncSnapshot.js';
import { DoctorVisibility } from '../doctorVisibility.js';
import { FakeAssignments, FakeChemists, FakeConfig, FakeDistributors, FakeDoctors, FakeProducts, FakeSampleAllocations, FakeTerritory, FakeUsers, FakeSpecialties } from './fmdTestKit.js';


type Snapshot = {
  doctors: Array<{ id: string; name: string }>;
  pendingDoctors: Array<{ id: string; name: string }>;
  chemists: Array<{ id: string; name: string }>;
  distributors: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  sampleAllocations: Array<{ id: string; doctorId: string; quantityRemaining: number }>;
};

describe('the phone’s cache of Field Master Data', () => {
  let assignments: FakeAssignments;
  let doctors: FakeDoctors;
  let chemists: FakeChemists;
  let products: FakeProducts;
  let distributors: FakeDistributors;
  let allocations: FakeSampleAllocations;
  let territory: FakeTerritory;
  let config: FakeConfig;
  let source: ReturnType<typeof makeFieldMasterDataSource>;
  const snap = async (user: string) => (await source.snapshot(user)) as Snapshot;
  /** Names in a stable order — the snapshot itself is sorted by id, which is what makes its version stable. */
  const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name).sort();
  /** What the phone's version is a hash of: the snapshot's content, compared as text. */
  const fingerprint = async (user: string) => JSON.stringify(await source.snapshot(user));

  const doctor = async (name: string, routeId: string, status: 'active' | 'inactive' | 'pending' = 'active', addedBy = 'admin') =>
    doctors.create({ routeId, name, address: 'x', email: null, specialty: 'ENT', qualification: 'MS', clinicName: null, phone: null, photo: null, dateOfBirth: null, anniversary: null, visitFrequency: null, location: { latitude: 1, longitude: 2 }, capturedLocation: { latitude: 9, longitude: 9 }, status, addedBy, clientRequestId: null, approvedAt: null });
  const assign = (doctorId: string, userId: string) => assignments.create({ doctorId, userId, assignedBy: 'admin' });

  beforeEach(() => {
    assignments = new FakeAssignments();
    doctors = new FakeDoctors(assignments);
    chemists = new FakeChemists();
    products = new FakeProducts();
    distributors = new FakeDistributors();
    allocations = new FakeSampleAllocations();
    territory = new FakeTerritory();
    config = new FakeConfig();
    territory.userRoutes.set('mr1', ['route-1']);
    territory.userRoutes.set('mr2', ['route-2']);
    const users = new FakeUsers();
    source = makeFieldMasterDataSource({ doctors, chemists, products, specialties: new FakeSpecialties(['ENT', 'Cardiologist']), distributors, allocations, visibility: new DoctorVisibility(assignments, territory, users, config), territory });
  });

  it('is named fieldMasterData', () => {
    expect(source.name).toBe('fieldMasterData');
  });

  it('holds only the caller’s Doctors — never another MR’s, never inactive, never one nobody is assigned', async () => {
    const mine = await doctor('Dr Mine', 'route-1');
    const theirs = await doctor('Dr Theirs', 'route-2');
    await doctor('Dr Unassigned', 'route-1');
    const inactive = await doctor('Dr Inactive', 'route-1', 'inactive');
    await assign(mine.id, 'mr1');
    await assign(theirs.id, 'mr2');
    await assign(inactive.id, 'mr1');
    expect(names((await snap('mr1')).doctors)).toEqual(['Dr Mine']);
    expect(names((await snap('mr2')).doctors)).toEqual(['Dr Theirs']);
  });

  it('a Doctor appears when the MR gains its Route and vanishes when they lose it — what a row delta could not see', async () => {
    const d = await doctor('Dr Rao', 'route-1');
    await assign(d.id, 'mr1');
    const before = await fingerprint('mr1');
    territory.userRoutes.set('mr1', ['route-2']); // route-1 taken away; the Doctor row itself never changed
    expect((await snap('mr1')).doctors).toEqual([]);
    expect(await fingerprint('mr1')).not.toBe(before);
    territory.userRoutes.set('mr1', ['route-1']);
    expect(names((await snap('mr1')).doctors)).toEqual(['Dr Rao']);
    expect(await fingerprint('mr1')).toBe(before); // back to exactly the same snapshot, so the same version
  });

  it('with DOCTOR_VISIBILITY_FOLLOWS_ROUTE off, the MR keeps the Doctor without the Route', async () => {
    const d = await doctor('Dr Rao', 'route-1');
    await assign(d.id, 'mr1');
    territory.userRoutes.set('mr1', []);
    config.values.set('DOCTOR_VISIBILITY_FOLLOWS_ROUTE', 'false');
    expect(names((await snap('mr1')).doctors)).toEqual(['Dr Rao']);
  });

  it('lists the Doctors the MR added that are still waiting, apart from the working list', async () => {
    await doctor('Dr Waiting', 'route-1', 'pending', 'mr1');
    await doctor('Dr Someone Elses', 'route-1', 'pending', 'mr2');
    const s = await snap('mr1');
    expect(names(s.pendingDoctors)).toEqual(['Dr Waiting']);
    expect(s.doctors).toEqual([]);
  });

  it('Chemists are the active ones on the Routes the MR has, and follow the Routes too', async () => {
    await chemists.create({ routeId: 'route-1', name: 'Sai Pharmacy', address: 'a', location: null, status: 'active' });
    await chemists.create({ routeId: 'route-2', name: 'Far Pharmacy', address: 'a', location: null, status: 'active' });
    await chemists.create({ routeId: 'route-1', name: 'Closed Pharmacy', address: 'a', location: null, status: 'inactive' });
    expect(names((await snap('mr1')).chemists)).toEqual(['Sai Pharmacy']);
    territory.userRoutes.set('mr1', ['route-1', 'route-2']);
    expect(names((await snap('mr1')).chemists)).toEqual(['Far Pharmacy', 'Sai Pharmacy']);
  });

  it('Distributors: assigned to the MR or on one of their Routes, active only', async () => {
    const base = { zoneIds: [], hqIds: [], documents: [], gstNumber: 'G', contactPerson: 'c', mobile: '9', address: 'a', location: null, openingDuesPaise: 0 };
    await distributors.create({ ...base, routeIds: ['route-1'], name: 'On My Route', assignedUserIds: [], status: 'active' });
    await distributors.create({ ...base, routeIds: ['route-2'], name: 'Assigned To Me', assignedUserIds: ['mr1'], status: 'active' });
    await distributors.create({ ...base, routeIds: ['route-2'], name: 'Not Mine', assignedUserIds: ['mr2'], status: 'active' });
    await distributors.create({ ...base, routeIds: ['route-1'], name: 'Inactive', assignedUserIds: ['mr1'], status: 'inactive' });
    await distributors.create({ ...base, routeIds: ['route-2', 'route-1'], name: 'One Of Several Routes', assignedUserIds: [], status: 'active' });
    await distributors.create({ ...base, routeIds: [], hqIds: ['h1'], name: 'Whole HQ', assignedUserIds: [], status: 'active' });
    expect(names((await snap('mr1')).distributors)).toEqual(['Assigned To Me', 'On My Route', 'One Of Several Routes', 'Whole HQ']);
  });

  it('Products are the active catalog; allocations only for the Doctors in the MR’s set', async () => {
    const p1 = await products.create({ name: 'Cough Syrup', sku: 'CS', category: 'Syrup', composition: null, type: null, packSize: null, ptsPaise: null, ptrPaise: null, mrpPaise: null, gstPercent: null, division: null, status: 'active' });
    await products.create({ name: 'Old', sku: 'OLD', category: 'Syrup', composition: null, type: null, packSize: null, ptsPaise: null, ptrPaise: null, mrpPaise: null, gstPercent: null, division: null, status: 'inactive' });
    const mine = await doctor('Dr Mine', 'route-1');
    const theirs = await doctor('Dr Theirs', 'route-2');
    await assign(mine.id, 'mr1');
    await assign(theirs.id, 'mr2');
    await allocations.issue({ doctorId: mine.id, productId: p1!.id, quantity: 10, by: 'admin' });
    await allocations.issue({ doctorId: theirs.id, productId: p1!.id, quantity: 99, by: 'admin' });
    const s = await snap('mr1');
    expect(names(s.products)).toEqual(['Cough Syrup']);
    expect(s.sampleAllocations).toEqual([expect.objectContaining({ doctorId: mine.id, quantityRemaining: 10 })]);
    await allocations.decrementRemaining(s.sampleAllocations[0]!.id, 4);
    expect((await snap('mr1')).sampleAllocations[0]!.quantityRemaining).toBe(6); // a balance that changes comes through
  });

  it('gives the phone only what it needs: no assignment history, capture point or approval internals', async () => {
    const d = await doctor('Dr Rao', 'route-1');
    await assign(d.id, 'mr1');
    const json = JSON.stringify(await source.snapshot('mr1'));
    for (const secret of ['capturedLocation', 'capturedLatitude', 'addedBy', 'clientRequestId', 'approvedAt', 'assignedBy', 'assignedUserId', 'status']) {
      expect(json).not.toContain(`"${secret}"`);
    }
  });

  it('an unchanged world gives the same version every time, whatever order the data was created in', async () => {
    const a = await doctor('Dr A', 'route-1');
    const b = await doctor('Dr B', 'route-1');
    await assign(a.id, 'mr1');
    await assign(b.id, 'mr1');
    const first = await fingerprint('mr1');
    expect(await fingerprint('mr1')).toBe(first);
    // the same data, created the other way round, with different ids' creation order
    doctors.rows.reverse();
    assignments.rows.reverse();
    expect(await fingerprint('mr1')).toBe(first);
  });
});
