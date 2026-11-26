import type { ChemistDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHEMIST,
  buildChemist,
  buildChemistUpdate,
  chemistStepErrors,
  chemistToDraft,
  placeErrors,
} from './chemists';

const chemist: ChemistDto = {
  id: 'c1',
  placeId: 'p1',
  routeId: 'r1',
  name: 'Apollo Pharmacy',
  address: 'Hill Cart Road, Siliguri',
  phone: '9876543210',
  location: { latitude: 26.7271, longitude: 88.3953 },
  capturedLocation: null,
  status: 'active',
  addedBy: null,
  clientRequestId: null,
  approvedAt: null,
};

describe('buildChemist', () => {
  const filled = {
    placeId: 'p1',
    name: '  Apollo   Pharmacy ',
    address: ' Hill Cart Road ',
    phone: '9876543210',
    coordinates: { latitude: '26.7271', longitude: '88.3953' },
  };

  it('builds a normalized body with the point', () => {
    expect(buildChemist(filled)).toEqual({
      ok: true,
      body: {
        placeId: 'p1',
        name: 'Apollo Pharmacy',
        address: 'Hill Cart Road',
        phone: '9876543210',
        location: { latitude: 26.7271, longitude: 88.3953 },
      },
    });
  });
  it('sends a cleaned phone number, and refuses a bad one', () => {
    expect(buildChemist({ ...filled, phone: '+91 98765-43210' })).toMatchObject({ ok: true, body: { phone: '+919876543210' } });
    expect(buildChemist({ ...filled, phone: '12345' })).toMatchObject({ ok: false, errors: { phone: 'Enter a phone number of 10 to 15 digits.' } });
  });
  it('allows no location, sending null so the point can be set later', () => {
    expect(buildChemist({ ...filled, coordinates: { latitude: '', longitude: '' } })).toMatchObject(
      { ok: true, body: { location: null } },
    );
  });
  it('reports every problem at once', () => {
    const result = buildChemist(EMPTY_CHEMIST);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(['address', 'name', 'phone', 'placeId']);
  });
  it('refuses half a location, with the error on the missing coordinate', () => {
    expect(
      buildChemist({ ...filled, coordinates: { latitude: '26.7', longitude: '' } }),
    ).toMatchObject({
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
    expect(buildChemistUpdate(chemist, { ...draft, name: ' Apollo  Pharmacy' })).toEqual({
      ok: true,
      body: {},
    });
  });
  it('sends only what changed', () => {
    expect(buildChemistUpdate(chemist, { ...draft, placeId: 'p2', address: 'New Road' })).toEqual({
      ok: true,
      body: { placeId: 'p2', address: 'New Road' },
    });
  });
  it('sends a phone when changed, and refuses clearing it', () => {
    expect(buildChemistUpdate(chemist, { ...draft, phone: '9876500000' })).toEqual({ ok: true, body: { phone: '9876500000' } });
    expect(buildChemistUpdate(chemist, { ...draft, phone: '' })).toMatchObject({ ok: false, errors: { phone: 'Enter the chemist’s phone number.' } });
  });
  it('sends the new point when it moved, and null when it was cleared', () => {
    expect(
      buildChemistUpdate(chemist, {
        ...draft,
        coordinates: { latitude: '26.8', longitude: '88.4' },
      }),
    ).toMatchObject({
      body: { location: { latitude: 26.8, longitude: 88.4 } },
    });
    expect(
      buildChemistUpdate(chemist, { ...draft, coordinates: { latitude: '', longitude: '' } }),
    ).toEqual({ ok: true, body: { location: null } });
  });
  it('sets a point on a chemist that had none', () => {
    const none = { ...chemist, location: null };
    expect(
      buildChemistUpdate(none, {
        ...chemistToDraft(none),
        coordinates: { latitude: '26.7', longitude: '88.3' },
      }),
    ).toMatchObject({
      body: { location: { latitude: 26.7, longitude: 88.3 } },
    });
  });
});

describe('placeErrors', () => {
  it('names the field in the message', () => {
    expect(placeErrors({ ...EMPTY_CHEMIST }, 'clinic name')['name']).toBe('Enter the clinic name.');
  });
});

describe('chemistStepErrors', () => {
  const filled = {
    placeId: 'p1',
    name: 'Apollo',
    address: 'Hill Cart Road',
    phone: '9876543210',
    coordinates: { latitude: '26.7', longitude: '88.4' },
  };
  it('the details step checks only the details, the location step only the point, the review step everything', () => {
    const empty = {
      ...filled,
      placeId: '',
      name: '',
      coordinates: { latitude: '95', longitude: '' },
    };
    expect(Object.keys(chemistStepErrors(empty, 'details')).sort()).toEqual(['name', 'placeId']);
    expect(Object.keys(chemistStepErrors(empty, 'location')).sort()).toEqual([
      'latitude',
      'longitude',
    ]);
    expect(Object.keys(chemistStepErrors(empty, 'review')).sort()).toEqual([
      'latitude',
      'longitude',
      'name',
      'placeId',
    ]);
  });
  it('a complete draft is fine on every step, and so is a chemist with no point yet', () => {
    for (const step of ['details', 'location', 'review'] as const)
      expect(chemistStepErrors(filled, step)).toEqual({});
    expect(
      chemistStepErrors({ ...filled, coordinates: { latitude: '', longitude: '' } }, 'review'),
    ).toEqual({});
  });
});
