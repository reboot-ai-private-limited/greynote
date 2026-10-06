import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { CreateChemistUseCase } from './createChemist.usecase.js';
import { CreateProductUseCase } from './createProduct.usecase.js';
import { FakeChemists, FakeProducts, FakeTerritory } from './fmdTestKit.js';
import { GetChemistUseCase } from './getChemist.usecase.js';
import { GetProductUseCase } from './getProduct.usecase.js';
import { ListChemistsUseCase } from './listChemists.usecase.js';
import { ListProductsUseCase } from './listProducts.usecase.js';
import { UpdateChemistUseCase } from './updateChemist.usecase.js';
import { UpdateProductUseCase } from './updateProduct.usecase.js';

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

const page = { page: 1, pageSize: 20 };

describe('Products', () => {
  let products: FakeProducts;
  beforeEach(() => {
    products = new FakeProducts();
  });

  it('creates an active product and refuses a duplicate SKU ignoring case and spaces', async () => {
    const create = new CreateProductUseCase(products);
    const p = await create.execute({ name: 'Paracetamol 500', sku: 'PCM-500', category: 'Tablet', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const });
    expect(p.status).toBe('active');
    await expectStatus(create.execute({ name: 'Other', sku: ' pcm-500 ', category: 'Tablet', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const }), 409);
  });

  it('keeps the new product fields, and an optional division', async () => {
    const create = new CreateProductUseCase(products);
    const p = await create.execute({ name: 'XYZ-500', sku: 'XYZ-500', category: 'Analgesic/Antipyretic', composition: 'Paracetamol 500mg', type: 'TABLET', packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12, division: 'General' });
    expect(p).toMatchObject({ composition: 'Paracetamol 500mg', type: 'TABLET', packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12, division: 'General' });
    expect((await create.execute({ name: 'No division', sku: 'ND-1', category: 'Tablet', composition: 'x', type: 'CAPSULE', packSize: '1×10', ptsPaise: 1, ptrPaise: 1, mrpPaise: 1, gstPercent: 5 })).division).toBeNull();
  });

  it('refuses prices out of order — PTS above PTR, PTR above MRP — on create and on a one-field edit', async () => {
    const create = new CreateProductUseCase(products);
    const base = { name: 'P', sku: 'P-1', category: 'Tablet', composition: 'x', type: 'TABLET' as const, packSize: '10×10', gstPercent: 12 as const };
    await expectStatus(create.execute({ ...base, ptsPaise: 9500, ptrPaise: 9000, mrpPaise: 11000 }), 400);
    await expectStatus(create.execute({ ...base, ptsPaise: 8000, ptrPaise: 12000, mrpPaise: 11000 }), 400);
    const ok = await create.execute({ ...base, ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000 });
    const update = new UpdateProductUseCase(products);
    await expectStatus(update.execute(ok.id, { mrpPaise: 8500 }), 400); // below the stored PTR
    await expectStatus(update.execute(ok.id, { ptsPaise: 9500 }), 400); // above the stored PTR
    expect((await update.execute(ok.id, { ptsPaise: 9000 })).ptsPaise).toBe(9000); // equal is fine
    expect((await update.execute(ok.id, { mrpPaise: 12000, ptrPaise: 10000 })).mrpPaise).toBe(12000);
  });

  it('an older product with no prices can still be edited, and nothing is compared until the prices exist', async () => {
    const old = await products.create({ name: 'Old', sku: 'OLD-1', category: 'Tablet', composition: null, type: null, packSize: null, ptsPaise: null, ptrPaise: null, mrpPaise: null, gstPercent: null, division: null, status: 'active' });
    const update = new UpdateProductUseCase(products);
    expect((await update.execute(old!.id, { name: 'Old renamed' })).name).toBe('Old renamed');
    expect((await update.execute(old!.id, { mrpPaise: 5000 })).mrpPaise).toBe(5000);
  });

  it('edits and deactivates, refuses a SKU another product has, and 404s an unknown id', async () => {
    const create = new CreateProductUseCase(products);
    const a = await create.execute({ name: 'A', sku: 'A-1', category: 'Tablet', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const });
    await create.execute({ name: 'B', sku: 'B-1', category: 'Syrup', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const });
    const update = new UpdateProductUseCase(products);
    expect((await update.execute(a.id, { name: 'A2', status: 'inactive' })).status).toBe('inactive');
    expect((await update.execute(a.id, { sku: 'a-1' })).sku).toBe('a-1'); // its own SKU is not a clash
    await expectStatus(update.execute(a.id, { sku: 'b-1' }), 409);
    await expectStatus(update.execute('nope', { name: 'x' }), 404);
    await expectStatus(new GetProductUseCase(products).execute('nope'), 404);
  });

  it('lists with search on name or SKU, category and status', async () => {
    const create = new CreateProductUseCase(products);
    await create.execute({ name: 'Amoxicillin', sku: 'AMX-1', category: 'Capsule', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const });
    const b = await create.execute({ name: 'Cough Syrup', sku: 'CS-9', category: 'Syrup', composition: 'Paracetamol 500mg', type: 'TABLET' as const, packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 as const });
    await new UpdateProductUseCase(products).execute(b.id, { status: 'inactive' });
    const list = new ListProductsUseCase(products);
    expect((await list.execute({ ...page, search: 'amx' })).items.map((p) => p.name)).toEqual(['Amoxicillin']);
    expect((await list.execute({ ...page, category: 'Syrup' })).total).toBe(1);
    expect((await list.execute({ ...page, status: 'inactive' })).items[0]!.name).toBe('Cough Syrup');
  });
});

describe('Chemists', () => {
  let chemists: FakeChemists;
  let territory: FakeTerritory;
  const input = { routeId: 'route-1', name: 'Sai Pharmacy', address: '12 Main Rd', location: { latitude: 26.7, longitude: 88.4 } };

  beforeEach(() => {
    chemists = new FakeChemists();
    territory = new FakeTerritory();
  });

  it('creates an active chemist on an active route, with or without a location', async () => {
    const create = new CreateChemistUseCase(chemists, territory);
    const a = await create.execute(input);
    expect(a.status).toBe('active');
    expect(a.location).toEqual({ latitude: 26.7, longitude: 88.4 });
    expect((await create.execute({ ...input, name: 'No Pin', location: null })).location).toBeNull();
  });

  it('refuses an unknown route (404) and an inactive one (409)', async () => {
    const create = new CreateChemistUseCase(chemists, territory);
    await expectStatus(create.execute({ ...input, routeId: 'route-x' }), 404);
    await expectStatus(create.execute({ ...input, routeId: 'route-off' }), 409);
    expect(chemists.rows).toHaveLength(0);
  });

  it('moves to another active route only, and leaves the route check out when it did not change', async () => {
    const c = await new CreateChemistUseCase(chemists, territory).execute(input);
    const update = new UpdateChemistUseCase(chemists, territory);
    expect((await update.execute(c.id, { routeId: 'route-2' })).routeId).toBe('route-2');
    await expectStatus(update.execute(c.id, { routeId: 'route-off' }), 409);
    territory.routes.set('route-2', 'inactive'); // its own route going inactive doesn't block other edits
    expect((await update.execute(c.id, { routeId: 'route-2', name: 'Renamed' })).name).toBe('Renamed');
  });

  it('corrects, sets and clears the location', async () => {
    const c = await new CreateChemistUseCase(chemists, territory).execute({ ...input, location: null });
    const update = new UpdateChemistUseCase(chemists, territory);
    expect((await update.execute(c.id, { location: { latitude: 1, longitude: 2 } })).location).toEqual({ latitude: 1, longitude: 2 });
    expect((await update.execute(c.id, { location: null })).location).toBeNull();
    await expectStatus(update.execute('nope', { name: 'x' }), 404);
    await expectStatus(new GetChemistUseCase(chemists).execute('nope'), 404);
  });

  it('lists by route, status and name', async () => {
    const create = new CreateChemistUseCase(chemists, territory);
    await create.execute(input);
    const b = await create.execute({ ...input, routeId: 'route-2', name: 'City Meds' });
    await new UpdateChemistUseCase(chemists, territory).execute(b.id, { status: 'inactive' });
    const list = new ListChemistsUseCase(chemists);
    expect((await list.execute({ ...page, routeId: 'route-2' })).items.map((c) => c.name)).toEqual(['City Meds']);
    expect((await list.execute({ ...page, status: 'active' })).total).toBe(1);
    expect((await list.execute({ ...page, search: 'sai' })).items[0]!.name).toBe('Sai Pharmacy');
  });
});
