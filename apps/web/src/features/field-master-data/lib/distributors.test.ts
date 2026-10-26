import type { DistributorDto, DistributorImpactDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DISTRIBUTOR,
  GST,
  buildDistributor,
  buildDistributorUpdate,
  distributorStepErrors,
  distributorImpactLines,
  distributorToDraft,
  normalizeGst,
  normalizeMobile,
  type DistributorDraft,
} from './distributors';

const distributor: DistributorDto = {
  id: 'd1',
  zoneIds: [],
  hqIds: [],
  routeIds: ['r1', 'r2'],
  name: 'Eastern Pharma',
  gstNumber: '19ABCDE1234F1Z5',
  contactPerson: 'S. Das',
  mobile: '9830012345',
  address: 'Sevoke Road, Siliguri',
  openingDuesPaise: 0,
  location: { latitude: 26.7, longitude: 88.4 },
  assignedUserIds: ['mr1', 'rsm1'],
  documents: [],
  status: 'active',
};
const filled: DistributorDraft = distributorToDraft(distributor);

describe('GST and mobile', () => {
  it('accepts a well-formed GST number and refuses others', () => {
    expect(GST.test('19ABCDE1234F1Z5')).toBe(true);
    expect(GST.test('19ABCDE1234F1X5')).toBe(false); // 14th character must be Z
    expect(GST.test('19ABCDE1234F1Z')).toBe(false);
  });
  it('normalizes what people type', () => {
    expect(normalizeGst(' 19abcde 1234f1z5 ')).toBe('19ABCDE1234F1Z5');
    expect(normalizeMobile('+91 98300-12345')).toBe('+919830012345');
  });
});

describe('buildDistributor', () => {
  it('builds a body with every route and every assigned person', () => {
    expect(
      buildDistributor({ ...filled, gstNumber: ' 19abcde1234f1z5 ', mobile: '98300 12345' }),
    ).toEqual({
      ok: true,
      body: {
        zoneIds: [],
        hqIds: [],
        routeIds: ['r1', 'r2'],
        name: 'Eastern Pharma',
        gstNumber: '19ABCDE1234F1Z5',
        contactPerson: 'S. Das',
        mobile: '9830012345',
        address: 'Sevoke Road, Siliguri',
        location: { latitude: 26.7, longitude: 88.4 },
        assignedUserIds: ['mr1', 'rsm1'],
        openingDuesPaise: 0,
      },
    });
  });
  it('carries opening dues in rupees as whole paise, refuses a bad amount, and sends a change only when it changed', () => {
    expect(buildDistributor({ ...filled, openingDues: '25000.50' })).toMatchObject({ ok: true, body: { openingDuesPaise: 2_500_050 } });
    expect(buildDistributor({ ...filled, openingDues: '12x' })).toMatchObject({ ok: false });
    expect(buildDistributorUpdate(distributor, { ...filled, openingDues: '100' })).toEqual({ ok: true, body: { openingDuesPaise: 10_000 } });
    expect(buildDistributorUpdate(distributor, filled)).toEqual({ ok: true, body: {} });
  });
  it('needs at least one zone, HQ or route, and reports every missing field at once', () => {
    const result = buildDistributor(EMPTY_DISTRIBUTOR);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(
        ['address', 'contactPerson', 'gstNumber', 'mobile', 'coverage', 'name'].sort(),
      );
  });
  it('refuses a bad GST number and mobile', () => {
    expect(buildDistributor({ ...filled, gstNumber: 'NOTGST' })).toMatchObject({
      ok: false,
      errors: { gstNumber: expect.stringMatching(/15 characters/) },
    });
    expect(buildDistributor({ ...filled, mobile: '12345' })).toMatchObject({
      ok: false,
      errors: { mobile: expect.stringMatching(/10 to 15/) },
    });
  });
  it('people are optional and may be anyone', () => {
    expect(buildDistributor({ ...filled, assignedUserIds: [] })).toMatchObject({
      ok: true,
      body: { assignedUserIds: [] },
    });
  });
  it('allows no location, sending null', () => {
    expect(
      buildDistributor({ ...filled, coordinates: { latitude: '', longitude: '' } }),
    ).toMatchObject({ ok: true, body: { location: null } });
  });
});

describe('distributorStepErrors', () => {
  it('each step checks only its own fields; the review step checks everything', () => {
    const empty = { ...EMPTY_DISTRIBUTOR, coordinates: { latitude: '95', longitude: '' } };
    expect(Object.keys(distributorStepErrors(empty, 'details')).sort()).toEqual([
      'address',
      'contactPerson',
      'gstNumber',
      'mobile',
      'name',
    ]);
    expect(Object.keys(distributorStepErrors(empty, 'coverage'))).toEqual(['coverage']);
    expect(distributorStepErrors(empty, 'documents')).toEqual({});
    expect(Object.keys(distributorStepErrors(empty, 'location')).sort()).toEqual([
      'latitude',
      'longitude',
    ]);
    expect(Object.keys(distributorStepErrors(empty, 'review'))).toHaveLength(8);
  });
  it('a complete draft is fine on every step', () => {
    for (const step of ['details', 'coverage', 'location', 'documents', 'review'] as const)
      expect(distributorStepErrors(filled, step)).toEqual({});
  });
});

describe('buildDistributorUpdate', () => {
  it('is empty when nothing changed', () => {
    expect(buildDistributorUpdate(distributor, filled)).toEqual({ ok: true, body: {} });
  });
  it('sends only what changed', () => {
    expect(buildDistributorUpdate(distributor, { ...filled, mobile: '98300 99999' })).toEqual({
      ok: true,
      body: { mobile: '9830099999' },
    });
  });
  it('sends the whole new list of routes or people when either changed', () => {
    expect(buildDistributorUpdate(distributor, { ...filled, routeIds: ['r2'] })).toEqual({
      ok: true,
      body: { routeIds: ['r2'] },
    });
    expect(buildDistributorUpdate(distributor, { ...filled, assignedUserIds: [] })).toEqual({
      ok: true,
      body: { assignedUserIds: [] },
    });
    expect(
      buildDistributorUpdate(distributor, { ...filled, assignedUserIds: ['mr1', 'rsm1', 'asm1'] }),
    ).toEqual({ ok: true, body: { assignedUserIds: ['mr1', 'rsm1', 'asm1'] } });
  });
  it('a zone or an HQ alone is a complete coverage, and sends each list that changed', () => {
    expect(buildDistributor({ ...filled, routeIds: [], zoneIds: ['z1'] })).toMatchObject({ ok: true, body: { zoneIds: ['z1'], hqIds: [], routeIds: [] } });
    expect(buildDistributor({ ...filled, routeIds: [], hqIds: ['h1'] })).toMatchObject({ ok: true });
    expect(buildDistributorUpdate(distributor, { ...filled, zoneIds: ['z1'], routeIds: [] })).toEqual({ ok: true, body: { zoneIds: ['z1'], routeIds: [] } });
    expect(buildDistributorUpdate({ ...distributor, routeIds: ['r2', 'r1'] }, filled)).toEqual({ ok: true, body: {} }); // the same set in another order
  });
  it('sends null for a cleared location', () => {
    expect(
      buildDistributorUpdate(distributor, {
        ...filled,
        coordinates: { latitude: '', longitude: '' },
      }),
    ).toEqual({ ok: true, body: { location: null } });
  });
});

describe('distributorImpactLines', () => {
  const impact: DistributorImpactDto = { id: 'd1', name: 'Eastern Pharma', status: 'active', payments: 3, orders: 4, openOrders: 1, monthlyStock: 0, stockStatements: 1, documents: 2, assignedPeople: 1 };
  it('lists what is erased, flags open orders, and warns that totals change', () => {
    const lines = distributorImpactLines(impact);
    expect(lines.erased).toEqual([
      '3 payments recorded against it',
      '4 orders',
      '1 stock statement line',
      '2 uploaded documents, deleted from storage',
      'Its link to 1 assigned person',
    ]);
    expect(lines.open).toEqual(['1 order still open (placed, not delivered) will be erased too']);
    expect(lines.note).toMatch(/totals .* will change/);
  });
  it('a distributor with no history only says it cannot be undone', () => {
    const lines = distributorImpactLines({ ...impact, payments: 0, orders: 0, openOrders: 0, stockStatements: 0, documents: 0, assignedPeople: 0 });
    expect(lines).toEqual({ erased: [], open: [], note: 'This cannot be undone.' });
  });
});
