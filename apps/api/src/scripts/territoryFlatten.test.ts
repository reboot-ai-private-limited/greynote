import { describe, expect, it } from 'vitest';
import { planTerritoryFlatten, type OldRoute } from './territoryFlatten.js';

const wp = (label: string) => ({ label, latitude: 26.7, longitude: 88.4, placeId: `p-${label}` });
const areas = [
  { _id: 'a1', hqId: 'h1', type: 'HQ' },
  { _id: 'a2', hqId: 'h1', type: 'OUT_STATION' },
  { _id: 'a3', hqId: 'h2', type: 'EX_STATION' },
];
const hqs = [
  { _id: 'h1', name: 'SLG-1' },
  { _id: 'h2', name: 'JPG', basePlace: wp('Jalpaiguri') },
];
const route = (id: string, areaId: string, name: string, waypoints = [wp('Siliguri'), wp('Naxalbari')]): OldRoute => ({
  _id: id,
  name,
  nameKey: name.toLowerCase(),
  areaId,
  waypoints,
});

describe('planTerritoryFlatten', () => {
  it("takes the HQ and type from the Area and the destination from the last waypoint", () => {
    const { changes, problems } = planTerritoryFlatten({ areas, hqs, routes: [route('r1', 'a2', 'Naxalbari', [wp('Siliguri'), wp('Medical More'), wp('Naxalbari')])] });
    expect(problems).toEqual([]);
    expect(changes).toEqual([
      {
        id: 'r1',
        $set: { hqId: 'h1', type: 'OUT_STATION', destination: wp('Naxalbari') },
        $unset: { areaId: '', waypoints: '' },
      },
    ]);
  });

  it('keeps only the four place fields on the destination', () => {
    const noisy = { ...wp('Naxalbari'), extra: 'x' };
    const { changes } = planTerritoryFlatten({ areas, hqs, routes: [route('r1', 'a1', 'R', [wp('S'), noisy])] });
    expect(Object.keys(changes[0]!.$set.destination).sort()).toEqual(['label', 'latitude', 'longitude', 'placeId']);
  });

  it('skips a route already converted, so a second run changes nothing', () => {
    const done: OldRoute = { _id: 'r1', name: 'Naxalbari', hqId: 'h1' };
    expect(planTerritoryFlatten({ areas, hqs, routes: [done] }).changes).toEqual([]);
  });

  it('reports a route whose Area is gone, or that has no waypoints', () => {
    const { changes, problems } = planTerritoryFlatten({
      areas,
      hqs,
      routes: [route('r1', 'missing', 'Orphan'), route('r2', 'a1', 'Empty', [])],
    });
    expect(changes).toEqual([]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('no longer exists');
    expect(problems[1]).toContain('no waypoints');
  });

  it('reports two routes that now share a name under one HQ, but not under two HQs', () => {
    const clash = planTerritoryFlatten({ areas, hqs, routes: [route('r1', 'a1', 'Loop'), route('r2', 'a2', 'LOOP')] });
    expect(clash.problems).toHaveLength(1);
    expect(clash.problems[0]).toContain('same name under the same HQ');

    const fine = planTerritoryFlatten({ areas, hqs, routes: [route('r1', 'a1', 'Loop'), route('r2', 'a3', 'Loop')] });
    expect(fine.problems).toEqual([]);
  });

  it('also catches a clash with a route that was already converted on an earlier run', () => {
    const converted: OldRoute = { _id: 'r0', name: 'Loop', nameKey: 'loop', hqId: 'h1' };
    const { problems } = planTerritoryFlatten({ areas, hqs, routes: [converted, route('r1', 'a1', 'Loop')] });
    expect(problems).toHaveLength(1);
  });

  it("suggests a base place for an HQ without one — the first waypoint of its first route — and never for one that has it", () => {
    const { basePlaceSuggestions } = planTerritoryFlatten({
      areas,
      hqs,
      routes: [route('r2', 'a2', 'Second', [wp('Matigara'), wp('Sevoke')]), route('r1', 'a1', 'First', [wp('Siliguri'), wp('Naxalbari')]), route('r3', 'a3', 'Elsewhere')],
    });
    expect(basePlaceSuggestions).toEqual([{ hqId: 'h1', hqName: 'SLG-1', suggested: wp('Siliguri') }]);
  });
});
