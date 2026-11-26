import { describe, expect, it } from 'vitest';
import { planOutletPlaces } from './outletPlacesMigration.js';

const routes = [
  { _id: 'r1', toPlaceId: 'pA' },
  { _id: 'r2', toPlaceId: 'pB' },
  { _id: 'r3' },
];

describe('planOutletPlaces', () => {
  it("puts a doctor and a chemist on their route's To place, and a distributor on its routes' places", () => {
    const plan = planOutletPlaces({
      routes,
      doctors: [{ _id: 'd1', name: 'Dr A', routeId: 'r1' }],
      chemists: [{ _id: 'c1', name: 'Med B', routeId: 'r2' }],
      distributors: [{ _id: 'x1', name: 'Dist', routeIds: ['r1', 'r2', 'r1'], placeIds: ['pZ'] }],
    });
    expect(plan).toEqual({
      doctors: [{ id: 'd1', placeId: 'pA' }],
      chemists: [{ id: 'c1', placeId: 'pB' }],
      distributors: [{ id: 'x1', placeIds: ['pZ', 'pA', 'pB'] }],
      unplaced: [],
    });
  });

  it('reports a record whose route has no place (or is gone), and skips ones already placed', () => {
    const plan = planOutletPlaces({
      routes,
      doctors: [
        { _id: 'd1', name: 'Dr Gone', routeId: 'missing' },
        { _id: 'd2', name: 'Dr Old', routeId: 'r3' },
        { _id: 'd3', name: 'Dr Done', routeId: 'r1', placeId: 'pA' },
      ],
      chemists: [],
      distributors: [{ _id: 'x1', name: 'Half', routeIds: ['r1', 'r3'] }],
    });
    expect(plan.doctors).toEqual([]);
    expect(plan.distributors).toEqual([{ id: 'x1', placeIds: ['pA'] }]);
    expect(plan.unplaced).toEqual(['Doctor "Dr Gone" (d1)', 'Doctor "Dr Old" (d2)', 'Distributor "Half" (x1): some routes have no place']);
  });
});
