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
    const p = await create.execute({ name: 'Paracetamol 500', sku: 'PCM-500', category: 'Tablet' });
    expect(p.status).toBe('active');
    await expectStatus(create.execute({ name: 'Other', sku: ' pcm-500 ', category: 'Tablet' }), 409);
  });

  it('edits and deactivates, refuses a SKU another product has, and 404s an unknown id', async () => {
    const create = new CreateProductUseCase(products);
    const a = await create.execute({ name: 'A', sku: 'A-1', category: 'Tablet' });
    await create.execute({ name: 'B', sku: 'B-1', category: 'Syrup' });
    const update = new UpdateProductUseCase(products);
    expect((await update.execute(a.id, { name: 'A2', status: 'inactive' })).status).toBe('inactive');
    expect((await update.execute(a.id, { sku: 'a-1' })).sku).toBe('a-1'); // its own SKU is not a clash
    await expectStatus(update.execute(a.id, { sku: 'b-1' }), 409);
    await expectStatus(update.execute('nope', { name: 'x' }), 404);
    await expectStatus(new GetProductUseCase(products).execute('nope'), 404);
  });

  it('lists with search on name or SKU, category and status', async () => {
    const create = new CreateProductUseCase(products);
    await create.execute({ name: 'Amoxicillin', sku: 'AMX-1', category: 'Capsule' });
    const b = await create.execute({ name: 'Cough Syrup', sku: 'CS-9', category: 'Syrup' });
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
