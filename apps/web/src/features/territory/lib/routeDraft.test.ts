import type { RouteDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildRoute, changedRouteFields, kmLabel, parseKm, suggestedType } from './routeDraft';

const route = (over: Partial<RouteDto> = {}): RouteDto => ({
  id: 'r1',
  hqId: 'h1',
  name: 'SLG-1 to Naxalbari',
  destinationName: 'Naxalbari',
  type: 'EX_STATION',
  typeSource: 'MANUAL',
  distanceKm: '12.50',
  taPerKmRateOverridePaise: null,
  status: 'active',
  ...over,
});
const limits = { exStationKm: 15, outStationKm: 50 };

describe('parseKm', () => {
  it('accepts a positive number with up to 2 decimals', () => {
    expect(parseKm(' 12.5 ')).toEqual({ ok: true, km: '12.5' });
    expect(parseKm('40')).toEqual({ ok: true, km: '40' });
  });
  it('rejects empty, zero, negative, too many decimals and words', () => {
    for (const bad of ['', '0', '0.00', '-3', '1.234', 'abc', '1,5']) expect(parseKm(bad).ok).toBe(false);
  });
});

describe('suggestedType', () => {
  it('follows the server: strictly over a limit moves up', () => {
    expect(suggestedType('15', limits)).toBe('HQ');
    expect(suggestedType('15.5', limits)).toBe('EX_STATION');
    expect(suggestedType('50', limits)).toBe('EX_STATION');
    expect(suggestedType('51', limits)).toBe('OUT_STATION');
  });
  it('suggests nothing without a usable km or the limits', () => {
    expect(suggestedType('', limits)).toBeNull();
    expect(suggestedType('abc', limits)).toBeNull();
    expect(suggestedType('20', null)).toBeNull();
  });
});

describe('buildRoute', () => {
  const base = { hqId: 'h1', destinationName: '  Naxal   bari ', distanceKm: '12.5', type: 'EX_STATION', rate: '' };

  it('builds a normalized body and omits an empty rate', () => {
    expect(buildRoute(base)).toEqual({ ok: true, body: { hqId: 'h1', destinationName: 'Naxal bari', distanceKm: '12.5', type: 'EX_STATION' } });
  });

  it('Automatic sends no type', () => {
    const r = buildRoute({ ...base, type: 'AUTO' });
    expect(r.ok && 'type' in r.body).toBe(false);
  });

  it('converts a rupee rate to integer paise', () => {
    const r = buildRoute({ ...base, rate: '7.50' });
    expect(r.ok && r.body.taPerKmRateOverridePaise).toBe(750);
  });

  it('reports every problem at once', () => {
    const r = buildRoute({ hqId: '', destinationName: '', distanceKm: '', type: '', rate: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['destinationName', 'distanceKm', 'hqId', 'rate', 'type']);
  });

  it('rejects a type that is not one of the three', () => {
    expect(buildRoute({ ...base, type: 'NEARBY' })).toMatchObject({ ok: false, errors: { type: 'Choose a type.' } });
  });
});

describe('changedRouteFields', () => {
  const same = { destinationName: ' Naxalbari ', distanceKm: '12.5', type: 'EX_STATION' as const, rate: '' };

  it('is empty when nothing changed — 12.5 equals 12.50', () => {
    expect(changedRouteFields(route(), same)).toEqual({ ok: true, body: {} });
  });

  it('sends only what changed', () => {
    expect(changedRouteFields(route(), { ...same, destinationName: 'Dhupguri' })).toEqual({ ok: true, body: { destinationName: 'Dhupguri' } });
    expect(changedRouteFields(route(), { ...same, distanceKm: '40' })).toEqual({ ok: true, body: { distanceKm: '40' } });
  });

  it('sets a km on a route that had none', () => {
    expect(changedRouteFields(route({ distanceKm: null }), same)).toEqual({ ok: true, body: { distanceKm: '12.5' } });
  });

  it('Automatic hands the type back to the km, once', () => {
    expect(changedRouteFields(route(), { ...same, type: 'AUTO' })).toEqual({ ok: true, body: { typeSource: 'AUTO' } });
    expect(changedRouteFields(route({ typeSource: 'AUTO' }), { ...same, type: 'AUTO' })).toEqual({ ok: true, body: {} });
  });

  it('a chosen type replaces Automatic even when it equals the current one', () => {
    expect(changedRouteFields(route({ typeSource: 'AUTO' }), same)).toEqual({ ok: true, body: { type: 'EX_STATION' } });
  });

  it('clearing a rate sends null', () => {
    expect(changedRouteFields(route({ taPerKmRateOverridePaise: 750 }), same)).toEqual({ ok: true, body: { taPerKmRateOverridePaise: null } });
  });
});

describe('kmLabel', () => {
  it('never shows a missing km as 0', () => {
    expect(kmLabel({ distanceKm: '12.50' })).toBe('12.50 km');
    expect(kmLabel({ distanceKm: null })).toBe('Not set');
  });
});
