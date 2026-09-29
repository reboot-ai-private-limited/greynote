import { describe, expect, it } from 'vitest';
import { createChemistBodySchema, updateChemistBodySchema, updateProductBodySchema } from './field-master-data.schemas.js';

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
});
