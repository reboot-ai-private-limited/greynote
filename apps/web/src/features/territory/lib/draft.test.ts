import type { HqDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildHq, buildZone, changedHqFields, changedZoneFields, normalizeName } from './draft';

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
  it('builds a normalized body', () => {
    expect(buildHq({ zoneId: 'z', name: ' SLG-1 ' })).toEqual({ ok: true, body: { zoneId: 'z', name: 'SLG-1' } });
  });
  it('needs a zone and a name, and reports both at once', () => {
    expect(buildHq({ zoneId: '', name: 'SLG-1' })).toMatchObject({ ok: false, errors: { zoneId: 'Choose a zone.' } });
    const result = buildHq({ zoneId: '', name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['name', 'zoneId']);
  });
});

describe('changed fields', () => {
  const hq: HqDto = { id: '1', zoneId: 'z', name: 'SLG-1', status: 'active' };

  it('is empty when nothing changed (the API would reject an empty update)', () => {
    expect(changedZoneFields({ id: '1', name: 'North', status: 'active' }, { name: ' North ' })).toEqual({});
    expect(changedHqFields(hq, { name: ' SLG-1 ' })).toEqual({});
  });

  it('includes the name when it changed', () => {
    expect(changedHqFields(hq, { name: 'SLG-One' })).toEqual({ name: 'SLG-One' });
  });
});
