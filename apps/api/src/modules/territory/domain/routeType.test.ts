import { describe, expect, it } from 'vitest';
import { routeTypeWarning, suggestRouteType, typeChangeForDistance } from './routeType.js';

const th = { exStationKm: 15, outStationKm: 50 };

describe('Route type from distance', () => {
  it('is strictly over each threshold', () => {
    expect(suggestRouteType('15.00', th)).toBe('HQ');
    expect(suggestRouteType('15.01', th)).toBe('EX_STATION');
    expect(suggestRouteType('50.00', th)).toBe('EX_STATION');
    expect(suggestRouteType('50.01', th)).toBe('OUT_STATION');
    expect(suggestRouteType('0.5', th)).toBe('HQ');
  });

  it('suggests nothing without a distance', () => {
    expect(suggestRouteType(null, th)).toBeNull();
  });

  it('warns about a chosen type that disagrees, never about an agreeing one or an AUTO one', () => {
    expect(routeTypeWarning({ type: 'HQ', typeSource: 'MANUAL', distanceKm: '30.00' }, th)).toBe(
      '30.00 km suggests Ex-station, but this Route is set to HQ. DA follows the type that is set.',
    );
    expect(routeTypeWarning({ type: 'EX_STATION', typeSource: 'MANUAL', distanceKm: '30.00' }, th)).toBeNull();
    expect(routeTypeWarning({ type: 'HQ', typeSource: 'AUTO', distanceKm: '30.00' }, th)).toBeNull();
    expect(routeTypeWarning({ type: 'HQ', typeSource: 'MANUAL', distanceKm: null }, th)).toBeNull();
  });

  it('an AUTO Route follows a changed distance, a MANUAL one and an unknown distance do not', () => {
    expect(typeChangeForDistance({ type: 'HQ', typeSource: 'AUTO' }, '60.00', th)).toEqual({ type: 'OUT_STATION' });
    expect(typeChangeForDistance({ type: 'EX_STATION', typeSource: 'AUTO' }, '20.00', th)).toEqual({});
    expect(typeChangeForDistance({ type: 'HQ', typeSource: 'MANUAL' }, '60.00', th)).toEqual({});
    expect(typeChangeForDistance({ type: 'HQ', typeSource: 'AUTO' }, null, th)).toEqual({});
  });
});
