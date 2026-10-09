import { describe, expect, it } from 'vitest';
import {
  addDoctorBodySchema,
  adjustSampleBodySchema,
  createChemistBodySchema,
  createDistributorBodySchema,
  createProductBodySchema,
  issueSampleBodySchema,
  editAddedDoctorBodySchema,
  updateChemistBodySchema,
  updateProductBodySchema,
} from './field-master-data.schemas.js';

const route = 'a'.repeat(24);
const base = { routeId: route, name: 'Sai', address: 'Main Rd' };

describe('Field Master Data request schemas', () => {
  it('takes a chemist with a location, and turns a missing one into null', () => {
    expect(createChemistBodySchema.parse({ ...base, location: { latitude: 26.7, longitude: 88.4 } }).location).toEqual({ latitude: 26.7, longitude: 88.4 });
    expect(createChemistBodySchema.parse(base).location).toBeNull();
  });

  it('refuses half a location and out-of-range coordinates', () => {
    expect(createChemistBodySchema.safeParse({ ...base, location: { latitude: 26.7 } }).success).toBe(false);
    expect(createChemistBodySchema.safeParse({ ...base, location: { latitude: 91, longitude: 0 } }).success).toBe(false);
    expect(createChemistBodySchema.safeParse({ ...base, location: { latitude: 0, longitude: 181 } }).success).toBe(false);
  });

  it('refuses a bad route id and an empty edit, and lets an edit clear the location with null', () => {
    expect(createChemistBodySchema.safeParse({ ...base, routeId: 'x' }).success).toBe(false);
    expect(updateChemistBodySchema.safeParse({}).success).toBe(false);
    expect(updateProductBodySchema.safeParse({}).success).toBe(false);
    expect(updateChemistBodySchema.parse({ location: null }).location).toBeNull();
  });

  it('an MR-added doctor needs a phone location and a client request id', () => {
    const doctor = { routeId: route, name: 'Dr X', address: 'Rd', specialty: 'ENT', qualification: 'MS', location: { latitude: 26.7, longitude: 88.4 }, clientRequestId: 'abcd-1234' };
    expect(addDoctorBodySchema.parse(doctor).email).toBeNull();
    expect(addDoctorBodySchema.safeParse({ ...doctor, location: undefined }).success).toBe(false);
    expect(addDoctorBodySchema.safeParse({ ...doctor, clientRequestId: 'short' }).success).toBe(false);
    expect(addDoctorBodySchema.safeParse({ ...doctor, email: 'not-an-email' }).success).toBe(false);
    expect(editAddedDoctorBodySchema.safeParse({ ...doctor, clientRequestId: undefined }).success).toBe(true);
  });

  it('a distributor needs a GST number, a phone and at least one route; GST is upper-cased', () => {
    const d = { routeIds: [route], name: 'Shree', gstNumber: ' 19abcde1234f1z5 ', contactPerson: 'R', mobile: '9876543210', address: 'Rd' };
    const parsed = createDistributorBodySchema.parse(d);
    expect(parsed).toMatchObject({ gstNumber: '19ABCDE1234F1Z5', location: null, assignedUserIds: [] });
    expect(createDistributorBodySchema.safeParse({ ...d, routeIds: [] }).success).toBe(false);
    expect(createDistributorBodySchema.safeParse({ ...d, gstNumber: '12345' }).success).toBe(false);
    expect(createDistributorBodySchema.safeParse({ ...d, mobile: 'call me' }).success).toBe(false);
  });

  it('sample quantities are whole numbers within range; an adjust may go to zero, an issue may not', () => {
    expect(issueSampleBodySchema.safeParse({ productId: route, quantity: 0 }).success).toBe(false);
    expect(issueSampleBodySchema.safeParse({ productId: route, quantity: 2.5 }).success).toBe(false);
    expect(issueSampleBodySchema.safeParse({ productId: route, quantity: 3 }).success).toBe(true);
    expect(adjustSampleBodySchema.safeParse({ quantityAllocated: 0 }).success).toBe(true);
    expect(adjustSampleBodySchema.safeParse({ quantityAllocated: -1 }).success).toBe(false);
  });
});

describe('product body schemas (2026-10-06)', () => {
  const base = { name: 'XYZ-500', sku: 'XYZ-500', category: 'Analgesic/Antipyretic', composition: 'Paracetamol 500mg', type: 'TABLET', packSize: '10×10', ptsPaise: 8000, ptrPaise: 9000, mrpPaise: 11000, gstPercent: 12 };

  it('takes the product card: type and GST from their lists, prices in whole paise, division optional', () => {
    expect(createProductBodySchema.safeParse(base).success).toBe(true);
    expect(createProductBodySchema.safeParse({ ...base, division: 'General' }).success).toBe(true);
    for (const rate of [5, 12, 18, 28]) expect(createProductBodySchema.safeParse({ ...base, gstPercent: rate }).success).toBe(true);
  });

  it('refuses a GST slab or a type that is not on the list, a missing price, and a price that is not whole paise or not above 0', () => {
    for (const bad of [{ gstPercent: 7 }, { gstPercent: '12' }, { type: 'PILL' }, { ptsPaise: 0 }, { mrpPaise: 110.5 }, { ptrPaise: -1 }, { packSize: '' }]) {
      expect(createProductBodySchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
    expect(createProductBodySchema.safeParse({ ...base, mrpPaise: undefined }).success).toBe(false);
  });

  it('an update may change any one field, and null clears the division', () => {
    expect(updateProductBodySchema.safeParse({ gstPercent: 18 }).success).toBe(true);
    expect(updateProductBodySchema.safeParse({ division: null }).success).toBe(true);
    expect(updateProductBodySchema.safeParse({}).success).toBe(false);
    expect(updateProductBodySchema.safeParse({ gstPercent: 3 }).success).toBe(false);
  });
});
