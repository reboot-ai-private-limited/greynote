import type { ProductDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_PRODUCT, buildProduct, buildProductUpdate, distinctCategories, productToDraft } from './products';

const paracetamol: ProductDto = {
  id: 'p1',
  name: 'XYZ-500',
  sku: 'PARA-500',
  category: 'Analgesic/Antipyretic',
  composition: 'Paracetamol 500mg',
  type: 'TABLET',
  packSize: '10×10',
  ptsPaise: 8000,
  ptrPaise: 9000,
  mrpPaise: 11000,
  gstPercent: 12,
  hsn: '30049099',
  division: 'General',
  status: 'active',
};
const legacy: ProductDto = { ...paracetamol, composition: null, type: null, packSize: null, ptsPaise: null, ptrPaise: null, mrpPaise: null, gstPercent: null, hsn: null, division: null };
const filled = productToDraft(paracetamol);

describe('buildProduct', () => {
  it('builds the product card: rupees become paise, the type and GST come from their lists', () => {
    expect(buildProduct({ ...filled, name: '  XYZ-500 ', sku: ' PARA-500 ', category: ' Analgesic/Antipyretic ', pts: '80', ptr: '90.50', mrp: '110' })).toEqual({
      ok: true,
      body: { name: 'XYZ-500', sku: 'PARA-500', category: 'Analgesic/Antipyretic', composition: 'Paracetamol 500mg', type: 'TABLET', packSize: '10×10', ptsPaise: 8000, ptrPaise: 9050, mrpPaise: 11000, gstPercent: 12, hsn: '30049099', division: 'General' },
    });
  });
  it('leaves the division out when it is empty', () => {
    const built = buildProduct({ ...filled, division: '  ' });
    expect(built.ok && 'division' in built.body).toBe(false);
  });
  it('reports every missing field at once', () => {
    const result = buildProduct(EMPTY_PRODUCT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['category', 'composition', 'gst', 'hsn', 'mrp', 'name', 'packSize', 'ptr', 'pts', 'sku', 'type']);
  });
  it('refuses prices out of order, and a price that is not rupees', () => {
    expect(buildProduct({ ...filled, pts: '95' })).toMatchObject({ ok: false, errors: { pts: 'PTS cannot be more than PTR.' } });
    expect(buildProduct({ ...filled, ptr: '120' })).toMatchObject({ ok: false, errors: { ptr: 'PTR cannot be more than MRP.' } });
    expect(buildProduct({ ...filled, mrp: 'abc' })).toMatchObject({ ok: false, errors: { mrp: 'Enter an amount in rupees, like 90 or 90.50.' } });
    expect(buildProduct({ ...filled, mrp: '0' })).toMatchObject({ ok: false });
    expect(buildProduct({ ...filled, pts: '90', ptr: '90', mrp: '90' })).toMatchObject({ ok: true }); // equal is fine
  });
  it('refuses a type or GST that is not on the list', () => {
    expect(buildProduct({ ...filled, type: 'PILL' })).toMatchObject({ ok: false, errors: { type: 'Choose the type from the list.' } });
    expect(buildProduct({ ...filled, gst: '7' })).toMatchObject({ ok: false, errors: { gst: 'Choose the GST from the list.' } });
    for (const rate of ['5', '12', '18', '28']) expect(buildProduct({ ...filled, gst: rate })).toMatchObject({ ok: true });
  });
  it('refuses a SKU with a space inside, since the server ignores spaces when comparing', () => {
    expect(buildProduct({ ...filled, sku: 'PARA 500' })).toMatchObject({ ok: false, errors: { sku: 'A SKU has no spaces.' } });
  });
  it('refuses over-long values', () => {
    expect(buildProduct({ ...filled, name: 'x'.repeat(151) })).toMatchObject({ ok: false });
    expect(buildProduct({ ...filled, sku: 'x'.repeat(61) })).toMatchObject({ ok: false });
    expect(buildProduct({ ...filled, category: 'x'.repeat(101) })).toMatchObject({ ok: false });
    expect(buildProduct({ ...filled, composition: 'x'.repeat(301) })).toMatchObject({ ok: false });
  });
});

describe('buildProductUpdate', () => {
  it('sends only the changed fields', () => {
    expect(buildProductUpdate(paracetamol, { ...filled, category: 'Pain relief', mrp: '115' })).toEqual({
      ok: true,
      body: { category: 'Pain relief', mrpPaise: 11500 },
    });
  });
  it('is empty when nothing changed, even if only whitespace differs', () => {
    expect(buildProductUpdate(paracetamol, { ...filled, name: ' XYZ-500', sku: 'PARA-500 ' })).toEqual({ ok: true, body: {} });
  });
  it('clears the division with null, and changes type and GST', () => {
    expect(buildProductUpdate(paracetamol, { ...filled, division: '' })).toEqual({ ok: true, body: { division: null } });
    expect(buildProductUpdate(paracetamol, { ...filled, type: 'SYRUP', gst: '18' })).toEqual({ ok: true, body: { type: 'SYRUP', gstPercent: 18 } });
  });
  it('a product that has the details must keep them', () => {
    expect(buildProductUpdate(paracetamol, { ...filled, composition: '' })).toMatchObject({ ok: false, errors: { composition: 'Enter the composition.' } });
  });
  it('an older product can be renamed without the new details, but what is typed is still checked', () => {
    expect(buildProductUpdate(legacy, { ...productToDraft(legacy), name: 'Renamed' })).toEqual({ ok: true, body: { name: 'Renamed' } });
    expect(buildProductUpdate(legacy, { ...productToDraft(legacy), gst: '7' })).toMatchObject({ ok: false });
    expect(buildProductUpdate(legacy, { ...productToDraft(legacy), pts: '95', ptr: '90' })).toMatchObject({ ok: false });
  });
  it('completing an older product sends the details', () => {
    expect(buildProductUpdate(legacy, { ...filled, name: legacy.name, sku: legacy.sku, category: legacy.category })).toEqual({
      ok: true,
      body: { composition: 'Paracetamol 500mg', type: 'TABLET', packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12, hsn: '30049099', division: 'General' },
    });
  });
  it('HSN/SAC is 4 to 8 digits; an older product without one may stay without, a product with one keeps it', () => {
    for (const bad of ['123', '123456789', '21O69099']) expect(buildProduct({ ...filled, hsn: bad })).toMatchObject({ ok: false, errors: { hsn: 'HSN/SAC is 4 to 8 digits.' } });
    expect(buildProduct({ ...filled, hsn: '' })).toMatchObject({ ok: false, errors: { hsn: 'Enter the HSN/SAC.' } });
    expect(buildProduct({ ...filled, hsn: ' 21069099 ' })).toMatchObject({ ok: true, body: { hsn: '21069099' } });
    expect(buildProductUpdate(paracetamol, { ...filled, hsn: '' })).toMatchObject({ ok: false, errors: { hsn: 'Enter the HSN/SAC.' } });
    expect(buildProductUpdate(paracetamol, { ...filled, hsn: '21069099' })).toEqual({ ok: true, body: { hsn: '21069099' } });
    const typedNoHsn = { ...paracetamol, hsn: null };
    expect(buildProductUpdate(typedNoHsn, { ...productToDraft(typedNoHsn), name: 'Renamed' })).toEqual({ ok: true, body: { name: 'Renamed' } });
  });
});

describe('distinctCategories', () => {
  it('lists each category once, sorted', () => {
    expect(distinctCategories([{ category: 'Vitamin' }, { category: 'Analgesic' }, { category: 'Vitamin' }])).toEqual(['Analgesic', 'Vitamin']);
    expect(distinctCategories([])).toEqual([]);
  });
});
