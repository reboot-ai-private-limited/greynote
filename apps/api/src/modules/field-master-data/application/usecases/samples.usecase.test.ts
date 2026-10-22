import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DoctorViews } from '../doctorViews.js';
import { DoctorVisibility } from '../doctorVisibility.js';
import { AdjustSampleAllocationUseCase } from './adjustSampleAllocation.usecase.js';
import { AssignDoctorUseCase } from './assignDoctor.usecase.js';
import { CreateDoctorUseCase } from './createDoctor.usecase.js';
import { CreateProductUseCase } from './createProduct.usecase.js';
import { FakeAssignments, FakeConfig, FakeDoctors, FakeProducts, FakeSampleAllocations, FakeTerritory, FakeTransactions, FakeUsers, FakeSpecialties, retirementKit } from './fmdTestKit.js';
import { IssueSampleAllocationUseCase } from './issueSampleAllocation.usecase.js';
import { ListSampleAllocationsUseCase } from './listSampleAllocations.usecase.js';
import { UpdateProductUseCase } from './updateProduct.usecase.js';
import { SpecialtyCatalog } from '../specialtyCatalog.js';

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

const field = (id: string) => ({ id, role: 'FIELD' as const });
const admin = { id: 'admin', role: 'ADMIN' as const };

describe('Doctor sample allocations', () => {
  let allocations: FakeSampleAllocations;
  let doctors: FakeDoctors;
  let products: FakeProducts;
  let assignments: FakeAssignments;
  let territory: FakeTerritory;
  let users: FakeUsers;
  let issue: IssueSampleAllocationUseCase;
  let doctorId: string;
  let productId: string;

  beforeEach(async () => {
    allocations = new FakeSampleAllocations();
    assignments = new FakeAssignments();
    doctors = new FakeDoctors(assignments);
    products = new FakeProducts();
    territory = new FakeTerritory();
    users = new FakeUsers();
    territory.userRoutes.set('mr1', ['route-1']);
    const views = new DoctorViews(assignments, users);
    doctorId = (
      await new CreateDoctorUseCase(doctors, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiologist']))).execute(
        { routeId: 'route-1', name: 'Dr Rao', address: 'Rd', email: null, specialty: 'ENT', qualification: 'MS', location: null },
        'admin',
      )
    ).id;
    productId = (await new CreateProductUseCase(products).execute({ name: 'Cough Syrup', sku: 'CS-1', category: 'Syrup', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const })).id;
    issue = new IssueSampleAllocationUseCase(allocations, doctors, products);
  });

  const run = (quantity: number) => issue.execute({ doctorId, productId, quantity, adminId: 'admin' });

  it('issues samples, and issuing again adds to the same row', async () => {
    expect(await run(10)).toMatchObject({ quantityAllocated: 10, quantityRemaining: 10 });
    expect(await run(5)).toMatchObject({ quantityAllocated: 15, quantityRemaining: 15 });
    expect(allocations.rows).toHaveLength(1);
  });

  it('only for an active Doctor and an active Product that exist', async () => {
    await expectStatus(issue.execute({ doctorId: 'nope', productId, quantity: 1, adminId: 'admin' }), 404);
    await expectStatus(issue.execute({ doctorId, productId: 'nope', quantity: 1, adminId: 'admin' }), 400);
    await new UpdateProductUseCase(products).execute(productId, { status: 'inactive' });
    await expectStatus(run(1), 409);
    await new UpdateProductUseCase(products).execute(productId, { status: 'active' });
    await doctors.update(doctorId, { status: 'pending' });
    await expectStatus(run(1), 409);
    await doctors.update(doctorId, { status: 'inactive' });
    await expectStatus(run(1), 409);
    expect(allocations.rows).toHaveLength(0);
  });

  it('a decrement takes samples off, and never below zero', async () => {
    const a = await run(3);
    expect(await allocations.decrementRemaining(a.id, 2)).toBe(true);
    expect(await allocations.decrementRemaining(a.id, 2)).toBe(false); // only 1 left
    expect(allocations.rows[0]!.quantityRemaining).toBe(1);
    expect(await allocations.decrementRemaining(a.id, 1)).toBe(true);
    expect(await allocations.decrementRemaining(a.id, 1)).toBe(false);
    expect(allocations.rows[0]!.quantityRemaining).toBe(0);
  });

  it('many gives racing on the last units: exactly as many succeed as there is stock', async () => {
    const a = await run(5);
    const results = await Promise.all(Array.from({ length: 12 }, () => allocations.decrementRemaining(a.id, 1)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(allocations.rows[0]!.quantityRemaining).toBe(0);
  });

  it('Admin corrects the total but never below what was given out', async () => {
    const a = await run(10);
    await allocations.decrementRemaining(a.id, 4); // 4 given, 6 left
    const adjust = new AdjustSampleAllocationUseCase(allocations);
    const input = { doctorId, productId, adminId: 'admin' };
    expect(await adjust.execute({ ...input, total: 8 })).toMatchObject({ quantityAllocated: 8, quantityRemaining: 4 });
    expect(await adjust.execute({ ...input, total: 4 })).toMatchObject({ quantityAllocated: 4, quantityRemaining: 0 });
    await expectStatus(adjust.execute({ ...input, total: 3 }), 409);
    await expectStatus(adjust.execute({ ...input, productId: 'other', total: 3 }), 404);
  });

  it('who may see a Doctor’s samples: Admin, the assigned MR, their manager — a 404 to anyone else', async () => {
    await run(10);
    const visibility = new DoctorVisibility(assignments, territory, users, new FakeConfig());
    await new AssignDoctorUseCase(doctors, assignments, users, territory, new FakeTransactions(), retirementKit(doctors, assignments, users).retirement).execute(doctorId, 'mr1', 'admin');
    const list = new ListSampleAllocationsUseCase(allocations, doctors, products, visibility);
    for (const actor of [admin, field('mr1'), field('asm')]) {
      expect(await list.execute(actor, doctorId)).toMatchObject([{ productName: 'Cough Syrup', productSku: 'CS-1', quantityRemaining: 10 }]);
    }
    await expectStatus(list.execute(field('mr2'), doctorId), 404);
    await expectStatus(list.execute(field('stranger'), doctorId), 404);
    await expectStatus(list.execute(admin, 'nope'), 404);
  });
});
