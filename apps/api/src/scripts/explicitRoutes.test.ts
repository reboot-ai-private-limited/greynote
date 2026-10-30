import { describe, expect, it } from 'vitest';
import { planExplicitRoutes, type PlanInput } from './explicitRoutes.js';

const base: Omit<PlanInput, 'users'> = {
  hqs: [
    { id: 'hq-1', zoneId: 'z-1', status: 'active' },
    { id: 'hq-2', zoneId: 'z-1', status: 'active' },
    { id: 'hq-3', zoneId: 'z-1', status: 'inactive' },
  ],
  routes: [
    { id: 'r-1', hqId: 'hq-1', status: 'active' },
    { id: 'r-2', hqId: 'hq-1', status: 'active' },
    { id: 'r-3', hqId: 'hq-1', status: 'inactive' },
    { id: 'r-4', hqId: 'hq-2', status: 'active' },
  ],
  assignments: [],
};
const ids = (p: ReturnType<typeof planExplicitRoutes>) => p.map((x) => `${x.userId}:${x.routeId}`);

describe('planExplicitRoutes', () => {
  it('stores every active route of a covered HQ that has none stored', () => {
    const plan = planExplicitRoutes({ ...base, users: [{ userId: 'u', hqIds: ['hq-1'], zoneIds: ['z-1'] }] });
    expect(ids(plan)).toEqual(['u:r-1', 'u:r-2']);
  });

  it('leaves an HQ alone once the employee has a route stored there', () => {
    const plan = planExplicitRoutes({
      ...base,
      assignments: [{ userId: 'u', routeId: 'r-1' }],
      users: [{ userId: 'u', hqIds: ['hq-1', 'hq-2'], zoneIds: ['z-1'] }],
    });
    expect(ids(plan)).toEqual(['u:r-4']);
  });

  it('expands a Zone that names none of its HQs, but not one narrowed to some', () => {
    const wide = planExplicitRoutes({ ...base, users: [{ userId: 'a', hqIds: [], zoneIds: ['z-1'] }] });
    expect(ids(wide)).toEqual(['a:r-1', 'a:r-2', 'a:r-4']);
    const narrow = planExplicitRoutes({ ...base, users: [{ userId: 'b', hqIds: ['hq-2'], zoneIds: ['z-1'] }] });
    expect(ids(narrow)).toEqual(['b:r-4']);
  });

  it('skips inactive HQs and plans nothing twice for another employee', () => {
    const plan = planExplicitRoutes({ ...base, users: [{ userId: 'u', hqIds: ['hq-3'], zoneIds: [] }, { userId: 'v', hqIds: ['hq-2'], zoneIds: [] }] });
    expect(ids(plan)).toEqual(['v:r-4']);
  });
});
