import { describe, expect, it } from 'vitest';
import { planPlaces, type MigRoute } from './placesMigration.js';

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const route = (id: string, hqId: string, destinationName: string, over: Partial<MigRoute> = {}): MigRoute => ({
  _id: id,
  hqId,
  name: `x to ${destinationName}`,
  destinationName,
  type: 'EX_STATION',
  status: 'active',
  ...over,
});
const hqs = [
  { _id: 'h1', name: 'SILIGURI', status: 'active' },
  { _id: 'h2', name: 'MALDA', status: 'inactive' },
];

describe('planPlaces', () => {
  it('gives each HQ a town and each route HQ town ↔ a place with its type', () => {
    const plan = planPlaces({ hqs, places: [], routes: [route('r1', 'h1', 'Darjeeling'), route('r2', 'h1', 'Matigara', { type: 'HQ' })], newId: ids() });
    expect(plan.problems).toEqual([]);
    expect(plan.places).toEqual([
      { _id: 'new-1', hqId: 'h1', name: 'SILIGURI', nameKey: 'siliguri', type: 'HQ', isHqTown: true, status: 'active' },
      { _id: 'new-2', hqId: 'h2', name: 'MALDA', nameKey: 'malda', type: 'HQ', isHqTown: true, status: 'inactive' },
      { _id: 'new-3', hqId: 'h1', name: 'Darjeeling', nameKey: 'darjeeling', type: 'EX_STATION', isHqTown: false, status: 'active' },
      { _id: 'new-4', hqId: 'h1', name: 'Matigara', nameKey: 'matigara', type: 'HQ', isHqTown: false, status: 'active' },
    ]);
    expect(plan.routes).toEqual([
      { id: 'r1', fromPlaceId: 'new-1', toPlaceId: 'new-3', pairKey: 'new-1:new-3' },
      { id: 'r2', fromPlaceId: 'new-1', toPlaceId: 'new-4', pairKey: 'new-1:new-4' },
    ]);
  });

  it('a route to the HQ itself becomes town ↔ town and is reported', () => {
    const plan = planPlaces({ hqs, places: [], routes: [route('r1', 'h1', 'Siliguri', { name: 'SILIGURI to SILIGURI', type: 'HQ' })], newId: ids() });
    expect(plan.routes).toEqual([{ id: 'r1', fromPlaceId: 'new-1', toPlaceId: 'new-1', pairKey: 'new-1:new-1' }]);
    expect(plan.selfRoutes).toEqual(['SILIGURI to SILIGURI']);
    expect(plan.places).toHaveLength(2);
  });

  it('a place for an inactive route only is inactive; is safe to repeat (existing places and migrated routes are kept)', () => {
    const first = planPlaces({ hqs, places: [], routes: [route('r1', 'h1', 'Old', { status: 'inactive' })], newId: ids() });
    expect(first.places.find((p) => p.name === 'Old')).toMatchObject({ status: 'inactive' });

    const again = planPlaces({
      hqs,
      places: first.places.map((p) => ({ _id: p._id, hqId: p.hqId, nameKey: p.nameKey, isHqTown: p.isHqTown })),
      routes: [route('r1', 'h1', 'Old', { fromPlaceId: 'new-3' })],
      newId: ids(),
    });
    expect(again).toEqual({ places: [], routes: [], selfRoutes: [], problems: [] });
  });

  it('reports a route whose HQ is gone, and writes nothing for it', () => {
    const plan = planPlaces({ hqs, places: [], routes: [route('r9', 'gone', 'X')], newId: ids() });
    expect(plan.problems).toEqual(['Route "x to X" (r9) has no HQ.']);
    expect(plan.routes).toEqual([]);
  });
});
