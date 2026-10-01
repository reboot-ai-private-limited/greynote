import { MAX_WAYPOINTS, type WaypointDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { addWaypoint, hasPlace, moveWaypoint, removeWaypoint, sameWaypoints, stopRole, validateWaypoints } from './waypoints';

const wp = (id: string): WaypointDto => ({ label: id, latitude: 26.7, longitude: 88.4, placeId: id });
const ids = (list: readonly WaypointDto[]) => list.map((w) => w.placeId);

describe('addWaypoint', () => {
  it('appends in order', () => {
    const r = addWaypoint([wp('a')], wp('b'));
    expect(r.ok && ids(r.waypoints)).toEqual(['a', 'b']);
  });
  it('refuses the same place twice', () => {
    expect(addWaypoint([wp('a')], wp('a'))).toEqual({ ok: false, reason: 'DUPLICATE' });
    expect(hasPlace([wp('a')], 'a')).toBe(true);
  });
  it('refuses a stop past the maximum', () => {
    const full = Array.from({ length: MAX_WAYPOINTS }, (_, i) => wp(`p${i}`));
    expect(addWaypoint(full, wp('extra'))).toEqual({ ok: false, reason: 'FULL' });
  });
});

describe('moveWaypoint', () => {
  const list = [wp('a'), wp('b'), wp('c')];
  it('moves a stop up and down', () => {
    expect(ids(moveWaypoint(list, 1, -1))).toEqual(['b', 'a', 'c']);
    expect(ids(moveWaypoint(list, 1, 1))).toEqual(['a', 'c', 'b']);
  });
  it('does nothing off either end, and never mutates', () => {
    expect(ids(moveWaypoint(list, 0, -1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveWaypoint(list, 2, 1))).toEqual(['a', 'b', 'c']);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });
});

describe('removeWaypoint', () => {
  it('drops the stop at the index', () => expect(ids(removeWaypoint([wp('a'), wp('b'), wp('c')], 1))).toEqual(['a', 'c']));
});

describe('validateWaypoints', () => {
  it('needs a start and an end', () => {
    expect(validateWaypoints([wp('a')])).toMatch(/at least 2/);
    expect(validateWaypoints([wp('a'), wp('b')])).toBeUndefined();
  });
  it('caps the count', () => {
    expect(validateWaypoints(Array.from({ length: MAX_WAYPOINTS + 1 }, (_, i) => wp(`p${i}`)))).toMatch(/at most 25/);
  });
});

describe('stopRole', () => {
  it('names start, via and end', () => {
    expect([0, 1, 2, 3].map((i) => stopRole(i, 4))).toEqual(['Start', 'Via 1', 'Via 2', 'End']);
  });
});

describe('sameWaypoints', () => {
  it('is order-sensitive', () => {
    expect(sameWaypoints([wp('a'), wp('b')], [wp('a'), wp('b')])).toBe(true);
    expect(sameWaypoints([wp('a'), wp('b')], [wp('b'), wp('a')])).toBe(false);
    expect(sameWaypoints([wp('a')], [wp('a'), wp('b')])).toBe(false);
  });
});
