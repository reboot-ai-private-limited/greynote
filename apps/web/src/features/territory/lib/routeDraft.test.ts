import type { RouteDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildNewPlace, buildPlaceRoute, fixedTaText, buildRoute, changedPlaceRouteFields, changedRouteFields, kmLabel, parseKm, placeRouteChanges, routeTypeBetween, suggestedType, taModeOf, typeForKm } from './routeDraft';

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

describe('routes between places (2026-11-26)', () => {
  const base = { fromPlaceId: 'a', toPlaceId: 'b', distanceKm: '25', taMode: 'GRADE' as const, rate: '', fixed: '' };

  it('accepts a fixed TA of 0 (no TA for the day) but not a rate of 0 per km', () => {
    expect(buildPlaceRoute({ ...base, taMode: 'FIXED', fixed: '0' })).toMatchObject({ ok: true, body: { taFixedPaise: 0 } });
    expect(buildPlaceRoute({ ...base, taMode: 'RATE', rate: '0' })).toMatchObject({ ok: false });
    expect(buildPlaceRoute({ ...base, taMode: 'FIXED', fixed: '-5' })).toMatchObject({ ok: false });
    expect(fixedTaText(0)).toBe('No TA (fixed ₹0)');
    expect(fixedTaText(35000)).toBe('₹350 fixed');
  });

  it('builds the body for each TA choice, sending only the one chosen', () => {
    expect(buildPlaceRoute(base)).toEqual({ ok: true, body: { fromPlaceId: 'a', toPlaceId: 'b', distanceKm: '25' } });
    expect(buildPlaceRoute({ ...base, taMode: 'RATE', rate: '7.5', fixed: '350' })).toMatchObject({ body: { taPerKmRateOverridePaise: 750 } });
    expect(buildPlaceRoute({ ...base, taMode: 'FIXED', rate: '7.5', fixed: '350' })).toEqual({
      ok: true,
      body: { fromPlaceId: 'a', toPlaceId: 'b', distanceKm: '25', taFixedPaise: 35000 },
    });
  });

  it('refuses the same place twice, a missing end and an empty amount', () => {
    const r = buildPlaceRoute({ ...base, toPlaceId: 'a', taMode: 'FIXED' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['fixed', 'toPlaceId']);
    expect(buildPlaceRoute({ ...base, fromPlaceId: '' }).ok).toBe(false);
  });

  it('an edit sends only what changed, and switching the TA choice clears the other', () => {
    const route = { distanceKm: '25.00', taPerKmRateOverridePaise: 750, taFixedPaise: null } as RouteDto;
    expect(changedPlaceRouteFields(route, { distanceKm: '25', taMode: 'RATE', rate: '7.50', fixed: '' })).toEqual({ ok: true, body: {} });
    expect(changedPlaceRouteFields(route, { distanceKm: '25', taMode: 'FIXED', rate: '7.50', fixed: '200' })).toEqual({
      ok: true,
      body: { taPerKmRateOverridePaise: null, taFixedPaise: 20000 },
    });
    expect(taModeOf(route)).toBe('RATE');
  });

  it('types a route by the farther end, and out-station across HQs', () => {
    expect(routeTypeBetween({ hqId: 'h1', type: 'HQ' }, { hqId: 'h1', type: 'EX_STATION' })).toBe('EX_STATION');
    expect(routeTypeBetween({ hqId: 'h1', type: 'HQ' }, { hqId: 'h2', type: 'HQ' })).toBe('OUT_STATION');
  });
});

describe('adding a place with its km (2026-11-27)', () => {
  const base = { hqId: 'h1', name: ' Naxalbari ', type: 'EX_STATION' as const, distanceKm: '', taMode: 'GRADE' as const, rate: '', fixed: '' };
  it('always sends the km, and the TA when one is chosen', () => {
    expect(buildNewPlace({ ...base, distanceKm: '12' })).toEqual({ ok: true, body: { hqId: 'h1', name: 'Naxalbari', type: 'EX_STATION', distanceKm: '12' } });
    expect(buildNewPlace({ ...base, distanceKm: '25', taMode: 'FIXED', fixed: '350' })).toEqual({
      ok: true,
      body: { hqId: 'h1', name: 'Naxalbari', type: 'EX_STATION', distanceKm: '25', taFixedPaise: 35000 },
    });
  });
  it('needs a name, a type and a good km', () => {
    const r = buildNewPlace({ ...base, name: '', type: '', distanceKm: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['distanceKm', 'name', 'type']);
    const noKm = buildNewPlace(base);
    expect(noKm.ok).toBe(false);
    if (!noKm.ok) expect(Object.keys(noKm.errors)).toEqual(['distanceKm']);
  });
});

describe('the place/route dialog’s Save (2026-11-27)', () => {
  const r = route({ fromPlaceId: 'town', toPlaceId: 'p1', distanceKm: '25', taPerKmRateOverridePaise: 600 });
  const place = { name: 'Naxalbari', type: 'EX_STATION' as const };
  const draft = { name: 'Naxalbari', type: 'EX_STATION' as const, distanceKm: '25', taMode: 'RATE' as const, rate: '6', fixed: '' };
  it('sends nothing when nothing changed', () => {
    expect(placeRouteChanges(place, r, draft)).toEqual({ ok: true, body: {} });
  });
  it('sends only the part that changed', () => {
    expect(placeRouteChanges(place, r, { ...draft, type: 'OUT_STATION' })).toEqual({ ok: true, body: { place: { type: 'OUT_STATION' } } });
    expect(placeRouteChanges(place, r, { ...draft, distanceKm: '30' })).toEqual({ ok: true, body: { route: { distanceKm: '30' } } });
    expect(placeRouteChanges(place, r, { ...draft, name: ' Naxal ', distanceKm: '30' })).toEqual({ ok: true, body: { place: { name: 'Naxal' }, route: { distanceKm: '30' } } });
  });
  it('a route that is not a place’s own never sends a place part; a bad km is an error', () => {
    expect(placeRouteChanges(null, r, { ...draft, type: 'HQ' })).toEqual({ ok: true, body: {} });
    const bad = placeRouteChanges(place, r, { ...draft, distanceKm: 'abc' });
    expect(bad.ok).toBe(false);
  });
});

describe('"+ Place": the type follows the km until picked by hand', () => {
  it('sets it from the km, then leaves it alone', () => {
    expect(typeForKm('10', limits, '', false)).toBe('HQ');
    expect(typeForKm('30', limits, 'HQ', false)).toBe('EX_STATION');
    expect(typeForKm('80', limits, 'EX_STATION', false)).toBe('OUT_STATION');
    expect(typeForKm('80', limits, 'HQ', true)).toBe('HQ');
    expect(typeForKm('', limits, 'HQ', false)).toBe('HQ');
  });
});
