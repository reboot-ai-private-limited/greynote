import { describe, expect, it } from 'vitest';
import {
  addDoctorBodySchema,
  adjustSampleBodySchema,
  createChemistBodySchema,
  createDistributorBodySchema,
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
    const doctor = { routeId: route, category: 'A', name: 'Dr X', address: 'Rd', specialty: 'ENT', qualification: 'MS', location: { latitude: 26.7, longitude: 88.4 }, clientRequestId: 'abcd-1234' };
    expect(addDoctorBodySchema.parse(doctor).email).toBeNull();
    expect(addDoctorBodySchema.safeParse({ ...doctor, location: undefined }).success).toBe(false);
    expect(addDoctorBodySchema.safeParse({ ...doctor, clientRequestId: 'short' }).success).toBe(false);
    expect(addDoctorBodySchema.safeParse({ ...doctor, email: 'not-an-email' }).success).toBe(false);
    expect(editAddedDoctorBodySchema.safeParse({ ...doctor, clientRequestId: undefined }).success).toBe(true);
  });

  it('a distributor needs a GST number, a phone and both sales flags; GST is upper-cased', () => {
    const d = { routeId: route, name: 'Shree', gstNumber: ' 19abcde1234f1z5 ', contactPerson: 'R', mobile: '9876543210', address: 'Rd', primarySalesEnabled: true, secondarySalesEnabled: false };
    const parsed = createDistributorBodySchema.parse(d);
    expect(parsed).toMatchObject({ gstNumber: '19ABCDE1234F1Z5', location: null, assignedMrId: null, assignedAsmId: null });
    expect(createDistributorBodySchema.safeParse({ ...d, gstNumber: '12345' }).success).toBe(false);
    expect(createDistributorBodySchema.safeParse({ ...d, mobile: 'call me' }).success).toBe(false);
    expect(createDistributorBodySchema.safeParse({ ...d, primarySalesEnabled: undefined }).success).toBe(false);
  });

  it('sample quantities are whole numbers within range; an adjust may go to zero, an issue may not', () => {
    expect(issueSampleBodySchema.safeParse({ productId: route, quantity: 0 }).success).toBe(false);
    expect(issueSampleBodySchema.safeParse({ productId: route, quantity: 2.5 }).success).toBe(false);
    expect(issueSampleBodySchema.safeParse({ productId: route, quantity: 3 }).success).toBe(true);
    expect(adjustSampleBodySchema.safeParse({ quantityAllocated: 0 }).success).toBe(true);
    expect(adjustSampleBodySchema.safeParse({ quantityAllocated: -1 }).success).toBe(false);
  });
});
