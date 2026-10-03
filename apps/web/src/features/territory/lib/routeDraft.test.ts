import type { PlaceDto, RouteDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/ApiError';
import { buildDistanceOverride, buildRoute, changedRouteFields, distanceSummary, staleRevisionOf } from './routeDraft';

const place = (id: string): PlaceDto => ({ label: id, latitude: 1, longitude: 2, placeId: id });
const route = (over: Partial<RouteDto> = {}): RouteDto => ({
  id: 'r1',
  hqId: 'h1',
  name: 'Morning run',
  type: 'EX_STATION',
  destination: place('naxalbari'),
  distanceKm: '12.50',
  distanceSource: 'AUTO_CALCULATED',
  distanceStatus: 'CALCULATED',
  distanceCalculatedAt: '2026-10-01T00:00:00Z',
  taPerKmRateOverridePaise: null,
  revision: 3,
  status: 'active',
  ...over,
});
const conflict = (data: unknown, status = 409) =>
  new ApiError({ success: false, statusCode: status, code: 'CONFLICT', message: 'm', data, request: { method: 'PATCH', url: '/x', requestId: 'r' } });

describe('buildRoute', () => {
  const base = { hqId: 'h1', name: '  Morning   run ', type: 'EX_STATION', rate: '', destination: place('naxalbari') };

  it('builds a normalized body and omits an empty rate', () => {
    expect(buildRoute(base)).toEqual({
      ok: true,
      body: { hqId: 'h1', name: 'Morning run', type: 'EX_STATION', destination: place('naxalbari') },
    });
  });

  it('converts a rupee rate to integer paise', () => {
    const r = buildRoute({ ...base, rate: '7.50' });
    expect(r.ok && r.body.taPerKmRateOverridePaise).toBe(750);
  });

  it('rejects a bad rate, a missing HQ, type and destination, all at once', () => {
    const r = buildRoute({ hqId: '', name: '', type: '', rate: 'abc', destination: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['destination', 'hqId', 'name', 'rate', 'type']);
  });

  it('rejects a type that is not one of the three', () => {
    expect(buildRoute({ ...base, type: 'NEARBY' })).toMatchObject({ ok: false, errors: { type: 'Choose a type.' } });
  });
});

describe('changedRouteFields', () => {
  const same = { name: ' Morning run ', type: 'EX_STATION' as const, rate: '' };

  it('is empty when nothing changed', () => {
    expect(changedRouteFields(route(), same)).toEqual({ ok: true, body: {} });
  });

  it('sends only the name when only the name changed', () => {
    expect(changedRouteFields(route(), { ...same, name: 'Evening run' })).toEqual({ ok: true, body: { name: 'Evening run' } });
  });

  it('sends the type when it changed — it decides DA', () => {
    expect(changedRouteFields(route(), { ...same, type: 'OUT_STATION' })).toEqual({ ok: true, body: { type: 'OUT_STATION' } });
  });

  it('sets, changes and CLEARS the rate (clearing is null, not absent)', () => {
    expect(changedRouteFields(route(), { ...same, rate: '8' })).toEqual({ ok: true, body: { taPerKmRateOverridePaise: 800 } });
    const withRate = route({ taPerKmRateOverridePaise: 750 });
    expect(changedRouteFields(withRate, { ...same, rate: '' })).toEqual({ ok: true, body: { taPerKmRateOverridePaise: null } });
    expect(changedRouteFields(withRate, { ...same, rate: '7.5' })).toEqual({ ok: true, body: {} });
  });
});

describe('buildDistanceOverride', () => {
  it('accepts a positive figure with up to 2 decimals', () => {
    expect(buildDistanceOverride(' 12.5 ')).toEqual({ ok: true, distanceKm: '12.5' });
  });
  it.each(['0', '0.00', '-1', '1.234', 'abc', ''])('rejects %j', (value) => {
    expect(buildDistanceOverride(value).ok).toBe(false);
  });
});

describe('distanceSummary', () => {
  it('never shows a failed route as 0 km', () => {
    expect(distanceSummary(route({ distanceKm: null, distanceStatus: 'FAILED' }))).toEqual({ km: '—', label: 'Failed', tone: 'danger' });
  });
  it('distinguishes calculated from a manual override', () => {
    expect(distanceSummary(route())).toMatchObject({ km: '12.50 km', label: 'Calculated' });
    expect(distanceSummary(route({ distanceSource: 'MANUAL_OVERRIDE' }))).toMatchObject({ label: 'Manual', tone: 'accent' });
  });
});

describe('staleRevisionOf', () => {
  it('reads currentRevision from the revision conflict', () => {
    expect(staleRevisionOf(conflict({ field: 'revision', currentRevision: 7 }))).toEqual({ currentRevision: 7 });
  });
  it('ignores other conflicts and other errors', () => {
    expect(staleRevisionOf(conflict({ field: 'name' }))).toBeNull();
    expect(staleRevisionOf(conflict(undefined))).toBeNull();
    expect(staleRevisionOf(new Error('x'))).toBeNull();
  });
});
