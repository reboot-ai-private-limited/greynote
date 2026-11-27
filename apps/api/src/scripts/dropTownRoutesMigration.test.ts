import { describe, expect, it } from 'vitest';
import { planDropTownRoutes, type DropRoute } from './dropTownRoutesMigration.js';

const route = (id: string, name: string, from: string, to: string, status = 'active'): DropRoute => ({ id, name, fromPlaceId: from, toPlaceId: to, status });

describe('migrate:drop-town-routes (2026-11-27)', () => {
  const routes = [
    route('self-slg', 'SILIGURI to SILIGURI', 'slg', 'slg'),
    route('r-nax', 'SILIGURI to Naxalbari', 'slg', 'nax'),
    route('r-bag', 'SILIGURI to Bagdogra', 'slg', 'bag'),
    route('r-old', 'SILIGURI to Aaa', 'slg', 'aaa', 'inactive'),
    route('self-jal', 'JALPAIGURI to JALPAIGURI', 'jal', 'jal'),
  ];

  it('picks only routes whose two ends are the same place', () => {
    expect(planDropTownRoutes({ routes, doctors: [], chemists: [] }).routes.map((r) => r.id)).toEqual(['self-slg', 'self-jal']);
  });

  it('moves doctors and chemists to the first active route touching that place; others stay', () => {
    const plan = planDropTownRoutes({
      routes,
      doctors: [
        { id: 'd1', routeId: 'self-slg' },
        { id: 'd2', routeId: 'r-nax' },
        { id: 'd3', routeId: 'self-jal' },
      ],
      chemists: [{ id: 'c1', routeId: 'self-slg' }],
    });
    expect(plan.doctors).toEqual([{ id: 'd1', routeId: 'r-bag' }]);
    expect(plan.chemists).toEqual([{ id: 'c1', routeId: 'r-bag' }]);
    expect(plan.leftOnOldRoute).toBe(1);
  });
});
