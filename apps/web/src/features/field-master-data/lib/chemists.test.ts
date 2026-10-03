import type { ChemistDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_CHEMIST, buildChemist, buildChemistUpdate, chemistToDraft, placeErrors } from './chemists';

const chemist: ChemistDto = {
  id: 'c1',
  routeId: 'r1',
  name: 'Apollo Pharmacy',
  address: 'Hill Cart Road, Siliguri',
  location: { latitude: 26.7271, longitude: 88.3953 },
  status: 'active',
};

describe('buildChemist', () => {
  const filled = { routeId: 'r1', name: '  Apollo   Pharmacy ', address: ' Hill Cart Road ', coordinates: { latitude: '26.7271', longitude: '88.3953' } };

  it('builds a normalized body with the point', () => {
    expect(buildChemist(filled)).toEqual({
      ok: true,
      body: { routeId: 'r1', name: 'Apollo Pharmacy', address: 'Hill Cart Road', location: { latitude: 26.7271, longitude: 88.3953 } },
    });
  });
  it('allows no location, sending null so the point can be set later', () => {
    expect(buildChemist({ ...filled, coordinates: { latitude: '', longitude: '' } })).toMatchObject({ ok: true, body: { location: null } });
  });
  it('reports every problem at once', () => {
    const result = buildChemist(EMPTY_CHEMIST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['address', 'name', 'routeId']);
  });
  it('refuses half a location, with the error on the missing coordinate', () => {
    expect(buildChemist({ ...filled, coordinates: { latitude: '26.7', longitude: '' } })).toMatchObject({
      ok: false,
      errors: { longitude: 'Enter the longitude too.' },
    });
  });
  it('refuses over-long text', () => {
    expect(buildChemist({ ...filled, name: 'x'.repeat(151) })).toMatchObject({ ok: false });
    expect(buildChemist({ ...filled, address: 'x'.repeat(501) })).toMatchObject({ ok: false });
  });
});

describe('buildChemistUpdate', () => {
  const draft = chemistToDraft(chemist);
  it('is empty when nothing changed, whitespace aside', () => {
    expect(buildChemistUpdate(chemist, { ...draft, name: ' Apollo  Pharmacy' })).toEqual({ ok: true, body: {} });
  });
  it('sends only what changed', () => {
    expect(buildChemistUpdate(chemist, { ...draft, routeId: 'r2', address: 'New Road' })).toEqual({
      ok: true,
      body: { routeId: 'r2', address: 'New Road' },
    });
  });
  it('sends the new point when it moved, and null when it was cleared', () => {
    expect(buildChemistUpdate(chemist, { ...draft, coordinates: { latitude: '26.8', longitude: '88.4' } })).toMatchObject({
      body: { location: { latitude: 26.8, longitude: 88.4 } },
    });
    expect(buildChemistUpdate(chemist, { ...draft, coordinates: { latitude: '', longitude: '' } })).toEqual({ ok: true, body: { location: null } });
  });
  it('sets a point on a chemist that had none', () => {
    const none = { ...chemist, location: null };
    expect(buildChemistUpdate(none, { ...chemistToDraft(none), coordinates: { latitude: '26.7', longitude: '88.3' } })).toMatchObject({
      body: { location: { latitude: 26.7, longitude: 88.3 } },
    });
  });
});

describe('placeErrors', () => {
  it('names the field in the message', () => {
    expect(placeErrors({ ...EMPTY_CHEMIST }, 'clinic name')['name']).toBe('Enter the clinic name.');
  });
});
