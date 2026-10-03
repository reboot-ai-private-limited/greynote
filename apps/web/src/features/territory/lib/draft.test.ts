import type { HqDto, PlaceDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildHq, buildZone, changedHqFields, changedZoneFields, normalizeName } from './draft';

const siliguri: PlaceDto = { label: 'Siliguri', latitude: 26.71, longitude: 88.43, placeId: 'p-sil' };
const matigara: PlaceDto = { label: 'Matigara', latitude: 26.69, longitude: 88.39, placeId: 'p-mat' };

describe('normalizeName', () => {
  it('trims and collapses inner whitespace, like the server', () => {
    expect(normalizeName('  Siliguri   HQ ')).toBe('Siliguri HQ');
  });
});

describe('buildZone', () => {
  it('builds a normalized body', () => {
    expect(buildZone({ name: '  West   Bengal ' })).toEqual({ ok: true, body: { name: 'West Bengal' } });
  });
  it('rejects blank and over-long names', () => {
    expect(buildZone({ name: '   ' })).toMatchObject({ ok: false, errors: { name: 'Enter a name.' } });
    expect(buildZone({ name: 'x'.repeat(101) })).toMatchObject({ ok: false });
  });
});

describe('buildHq', () => {
  it('builds a body with the base place', () => {
    expect(buildHq({ zoneId: 'z', name: ' SLG-1 ', basePlace: siliguri })).toEqual({
      ok: true,
      body: { zoneId: 'z', name: 'SLG-1', basePlace: siliguri },
    });
  });
  it('needs a zone', () => {
    expect(buildHq({ zoneId: '', name: 'SLG-1', basePlace: siliguri })).toMatchObject({ ok: false, errors: { zoneId: 'Choose a zone.' } });
  });
  it('needs a base place — an HQ without one cannot have a route', () => {
    expect(buildHq({ zoneId: 'z', name: 'SLG-1', basePlace: null })).toMatchObject({
      ok: false,
      errors: { basePlace: expect.stringContaining('base place') },
    });
  });
  it('reports every problem at once', () => {
    const result = buildHq({ zoneId: '', name: '', basePlace: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['basePlace', 'name', 'zoneId']);
  });
});

describe('changed fields', () => {
  const hq: HqDto = { id: '1', zoneId: 'z', name: 'SLG-1', basePlace: siliguri, status: 'active' };

  it('is empty when nothing changed (the API would reject an empty update)', () => {
    expect(changedZoneFields({ id: '1', name: 'North', status: 'active' }, { name: ' North ' })).toEqual({});
    expect(changedHqFields(hq, { name: ' SLG-1 ', basePlace: { ...siliguri } })).toEqual({});
  });

  it('includes only what changed', () => {
    expect(changedHqFields(hq, { name: 'SLG-One', basePlace: siliguri })).toEqual({ name: 'SLG-One' });
    expect(changedHqFields(hq, { name: 'SLG-1', basePlace: matigara })).toEqual({ basePlace: matigara });
  });

  it('sends a first base place for an HQ that had none, and never an empty one', () => {
    const none: HqDto = { ...hq, basePlace: null };
    expect(changedHqFields(none, { name: 'SLG-1', basePlace: siliguri })).toEqual({ basePlace: siliguri });
    expect(changedHqFields(none, { name: 'SLG-1', basePlace: null })).toEqual({});
  });
});
