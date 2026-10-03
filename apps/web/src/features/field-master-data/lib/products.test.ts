import type { ProductDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_PRODUCT, buildProduct, buildProductUpdate, distinctCategories, productToDraft } from './products';

const paracetamol: ProductDto = { id: 'p1', name: 'Paracetamol 500', sku: 'PARA-500', category: 'Analgesic', status: 'active' };

describe('buildProduct', () => {
  it('builds a normalized body', () => {
    expect(buildProduct({ name: '  Paracetamol   500 ', sku: ' PARA-500 ', category: ' Analgesic ' })).toEqual({
      ok: true,
      body: { name: 'Paracetamol 500', sku: 'PARA-500', category: 'Analgesic' },
    });
  });
  it('reports every missing field at once', () => {
    const result = buildProduct(EMPTY_PRODUCT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['category', 'name', 'sku']);
  });
  it('refuses a SKU with a space inside, since the server ignores spaces when comparing', () => {
    expect(buildProduct({ ...productToDraft(paracetamol), sku: 'PARA 500' })).toMatchObject({
      ok: false,
      errors: { sku: 'A SKU has no spaces.' },
    });
  });
  it('refuses over-long values', () => {
    expect(buildProduct({ ...productToDraft(paracetamol), name: 'x'.repeat(151) })).toMatchObject({ ok: false });
    expect(buildProduct({ ...productToDraft(paracetamol), sku: 'x'.repeat(61) })).toMatchObject({ ok: false });
    expect(buildProduct({ ...productToDraft(paracetamol), category: 'x'.repeat(101) })).toMatchObject({ ok: false });
  });
});

describe('buildProductUpdate', () => {
  it('sends only the changed fields', () => {
    expect(buildProductUpdate(paracetamol, { ...productToDraft(paracetamol), category: 'Pain relief' })).toEqual({
      ok: true,
      body: { category: 'Pain relief' },
    });
  });
  it('is empty when nothing changed, even if only whitespace differs', () => {
    expect(buildProductUpdate(paracetamol, { name: ' Paracetamol  500', sku: 'PARA-500 ', category: 'Analgesic' })).toEqual({ ok: true, body: {} });
  });
  it('refuses an invalid edit', () => {
    expect(buildProductUpdate(paracetamol, { ...productToDraft(paracetamol), name: '' })).toMatchObject({ ok: false });
  });
});

describe('distinctCategories', () => {
  it('lists each category once, sorted', () => {
    expect(distinctCategories([{ category: 'Vitamin' }, { category: 'Analgesic' }, { category: 'Vitamin' }])).toEqual(['Analgesic', 'Vitamin']);
    expect(distinctCategories([])).toEqual([]);
  });
});
