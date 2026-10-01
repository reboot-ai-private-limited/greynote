import type { RouteDto, WaypointDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/ApiError';
import { buildDistanceOverride, buildRoute, changedRouteFields, distanceSummary, staleRevisionOf } from './routeDraft';

const wp = (id: string): WaypointDto => ({ label: id, latitude: 1, longitude: 2, placeId: id });
const route = (over: Partial<RouteDto> = {}): RouteDto => ({
  id: 'r1',
  areaId: 'a1',
  name: 'Morning run',
  waypoints: [wp('a'), wp('b')],
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
  const base = { areaId: 'a1', name: '  Morning   run ', rate: '', waypoints: [wp('a'), wp('b')] };

  it('builds a normalized body and omits an empty rate', () => {
    expect(buildRoute(base)).toEqual({ ok: true, body: { areaId: 'a1', name: 'Morning run', waypoints: [wp('a'), wp('b')] } });
  });

  it('converts a rupee rate to integer paise', () => {
    const r = buildRoute({ ...base, rate: '7.50' });
    expect(r.ok && r.body.taPerKmRateOverridePaise).toBe(750);
  });

  it('rejects a bad rate, a missing area and too few stops, all at once', () => {
    const r = buildRoute({ areaId: '', name: '', rate: 'abc', waypoints: [wp('a')] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['areaId', 'name', 'rate', 'waypoints']);
  });
});

describe('changedRouteFields', () => {
  it('is empty when nothing changed', () => {
    expect(changedRouteFields(route(), { name: ' Morning run ', rate: '' })).toEqual({ ok: true, body: {} });
  });

  it('sends only the name when only the name changed', () => {
    expect(changedRouteFields(route(), { name: 'Evening run', rate: '' })).toEqual({ ok: true, body: { name: 'Evening run' } });
  });

  it('sets, changes and CLEARS the rate (clearing is null, not absent)', () => {
    expect(changedRouteFields(route(), { name: 'Morning run', rate: '8' })).toEqual({ ok: true, body: { taPerKmRateOverridePaise: 800 } });
    const withRate = route({ taPerKmRateOverridePaise: 750 });
    expect(changedRouteFields(withRate, { name: 'Morning run', rate: '' })).toEqual({ ok: true, body: { taPerKmRateOverridePaise: null } });
    expect(changedRouteFields(withRate, { name: 'Morning run', rate: '7.5' })).toEqual({ ok: true, body: {} });
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
