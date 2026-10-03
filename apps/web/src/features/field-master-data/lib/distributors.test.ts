import type { DistributorDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DISTRIBUTOR,
  GST,
  buildDistributor,
  buildDistributorUpdate,
  distributorToDraft,
  normalizeGst,
  normalizeMobile,
  type DistributorDraft,
} from './distributors';

const distributor: DistributorDto = {
  id: 'd1',
  routeId: 'r1',
  name: 'Eastern Pharma',
  gstNumber: '19ABCDE1234F1Z5',
  contactPerson: 'S. Das',
  mobile: '9830012345',
  address: 'Sevoke Road, Siliguri',
  location: { latitude: 26.7, longitude: 88.4 },
  assignedMrId: 'mr1',
  assignedAsmId: null,
  primarySalesEnabled: true,
  secondarySalesEnabled: false,
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
  it('builds a body with the sales choices as booleans', () => {
    expect(buildDistributor({ ...filled, gstNumber: ' 19abcde1234f1z5 ', mobile: '98300 12345', assignedMrId: '', primarySales: 'yes', secondarySales: 'no' })).toEqual({
      ok: true,
      body: {
        routeId: 'r1',
        name: 'Eastern Pharma',
        gstNumber: '19ABCDE1234F1Z5',
        contactPerson: 'S. Das',
        mobile: '9830012345',
        address: 'Sevoke Road, Siliguri',
        location: { latitude: 26.7, longitude: 88.4 },
        assignedMrId: null,
        assignedAsmId: null,
        primarySalesEnabled: true,
        secondarySalesEnabled: false,
      },
    });
  });
  it('makes Admin choose both sales switches: there is no default', () => {
    const result = buildDistributor({ ...filled, primarySales: '', secondarySales: '' });
    expect(result).toMatchObject({ ok: false, errors: { primarySales: 'Choose yes or no.', secondarySales: 'Choose yes or no.' } });
  });
  it('reports every missing field at once', () => {
    const result = buildDistributor(EMPTY_DISTRIBUTOR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ['address', 'contactPerson', 'gstNumber', 'mobile', 'name', 'primarySales', 'routeId', 'secondarySales'].sort(),
      );
    }
  });
  it('refuses a bad GST number and mobile', () => {
    expect(buildDistributor({ ...filled, gstNumber: 'NOTGST' })).toMatchObject({ ok: false, errors: { gstNumber: expect.stringMatching(/15 characters/) } });
    expect(buildDistributor({ ...filled, mobile: '12345' })).toMatchObject({ ok: false, errors: { mobile: expect.stringMatching(/10 to 15/) } });
  });
  it('refuses the same person as MR and ASM', () => {
    expect(buildDistributor({ ...filled, assignedMrId: 'x', assignedAsmId: 'x' })).toMatchObject({
      ok: false,
      errors: { assignedAsmId: expect.stringMatching(/different/) },
    });
  });
  it('allows no location, sending null', () => {
    expect(buildDistributor({ ...filled, coordinates: { latitude: '', longitude: '' } })).toMatchObject({ ok: true, body: { location: null } });
  });
});

describe('buildDistributorUpdate', () => {
  it('is empty when nothing changed', () => {
    expect(buildDistributorUpdate(distributor, filled)).toEqual({ ok: true, body: {} });
  });
  it('sends only what changed, including a flipped sales switch', () => {
    expect(buildDistributorUpdate(distributor, { ...filled, mobile: '98300 99999', secondarySales: 'yes' })).toEqual({
      ok: true,
      body: { mobile: '9830099999', secondarySalesEnabled: true },
    });
  });
  it('un-assigns with null and assigns with an id', () => {
    expect(buildDistributorUpdate(distributor, { ...filled, assignedMrId: '' })).toEqual({ ok: true, body: { assignedMrId: null } });
    expect(buildDistributorUpdate(distributor, { ...filled, assignedAsmId: 'asm1' })).toEqual({ ok: true, body: { assignedAsmId: 'asm1' } });
  });
  it('does not resend an unchanged MR just because the form was opened', () => {
    expect(buildDistributorUpdate(distributor, filled)).toMatchObject({ body: {} });
  });
  it('sends null for a cleared location', () => {
    expect(buildDistributorUpdate(distributor, { ...filled, coordinates: { latitude: '', longitude: '' } })).toEqual({ ok: true, body: { location: null } });
  });
});
