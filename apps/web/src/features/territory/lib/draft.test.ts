import type { AreaDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildArea, buildHq, buildZone, changedAreaFields, changedZoneFields, normalizeName } from './draft';

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
  it('needs a zone', () => {
    expect(buildHq({ zoneId: '', name: 'Siliguri' })).toMatchObject({ ok: false, errors: { zoneId: 'Choose a zone.' } });
  });
  it('reports every problem at once', () => {
    const result = buildHq({ zoneId: '', name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['name', 'zoneId']);
  });
});

describe('buildArea', () => {
  it('needs an HQ and a valid type', () => {
    expect(buildArea({ hqId: 'h', name: 'Matigara', type: 'NOPE' })).toMatchObject({ ok: false, errors: { type: 'Choose a type.' } });
    expect(buildArea({ hqId: 'h', name: 'Matigara', type: 'EX_STATION' })).toEqual({
      ok: true,
      body: { hqId: 'h', name: 'Matigara', type: 'EX_STATION' },
    });
  });
});

describe('changed fields', () => {
  const area: AreaDto = { id: '1', hqId: 'h', name: 'Matigara', type: 'HQ', status: 'active' };

  it('is empty when nothing changed (the API would reject an empty update)', () => {
    expect(changedZoneFields({ id: '1', name: 'North', status: 'active' }, { name: ' North ' })).toEqual({});
    expect(changedAreaFields(area, { name: 'Matigara', type: 'HQ' })).toEqual({});
  });

  it('includes only what changed', () => {
    expect(changedAreaFields(area, { name: 'Matigara', type: 'OUT_STATION' })).toEqual({ type: 'OUT_STATION' });
    expect(changedAreaFields(area, { name: 'Bagdogra', type: 'HQ' })).toEqual({ name: 'Bagdogra' });
  });
});
