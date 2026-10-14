import { describe, expect, it } from 'vitest';
import { planRouteKm } from './routeKm.js';

const hqs = [{ _id: 'h1', name: 'SLG-1' }, { _id: 'h2', name: 'SLG-2' }];
const route = (id: string, hqId: string, name: string, label: string, distanceKm: unknown = '12.00') => ({ _id: id, hqId, name, destination: { label }, distanceKm });

describe('planRouteKm', () => {
  it('takes the destination from the label and makes "<HQ> to <destination>"', () => {
    const { changes } = planRouteKm({ routes: [route('r1', 'h1', 'Naxal route', 'Naxalbari, West Bengal, India')], hqs });
    expect(changes[0]!.$set).toEqual({ destinationName: 'Naxalbari', name: 'SLG-1 to Naxalbari', nameKey: 'slg-1 to naxalbari' });
    expect(Object.keys(changes[0]!.$unset)).toContain('destination');
  });

  it('falls back to the old route name when two routes of one HQ share a destination', () => {
    const { changes, renamed } = planRouteKm({
      routes: [route('r1', 'h1', 'A', 'Naxalbari, WB'), route('r2', 'h1', 'Naxal road 2', 'Naxalbari, WB'), route('r3', 'h2', 'C', 'Naxalbari, WB')],
      hqs,
    });
    expect(changes.map((c) => c.$set.name)).toEqual(['SLG-1 to Naxalbari', 'SLG-1 to Naxal road 2', 'SLG-2 to Naxalbari']);
    expect(renamed).toEqual([{ id: 'r2', from: 'Naxalbari', to: 'Naxal road 2' }]);
  });

  it('lists routes with no distance, and skips routes that are already converted', () => {
    const done = { ...route('r0', 'h1', 'SLG-1 to Done', 'x'), destinationName: 'Done' };
    const { changes, noKm } = planRouteKm({ routes: [done, route('r1', 'h1', 'A', 'Naxalbari', null)], hqs });
    expect(changes.map((c) => c.id)).toEqual(['r1']);
    expect(noKm).toEqual([{ id: 'r1', name: 'A' }]);
  });

  it('reports a route whose HQ is missing', () => {
    expect(planRouteKm({ routes: [route('r1', 'gone', 'A', 'X')], hqs }).problems).toHaveLength(1);
  });
});
