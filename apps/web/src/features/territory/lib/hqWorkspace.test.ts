import type { PlaceDto, RouteDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildHqWorkspace } from './hqWorkspace';

const place = (id: string, over: Partial<PlaceDto> = {}): PlaceDto => ({ id, hqId: 'h1', name: id, type: 'EX_STATION', isHqTown: false, status: 'active', ...over });
const route = (id: string, from: string | null, to: string | null, over: Partial<RouteDto> = {}): RouteDto => ({
  id,
  hqId: 'h1',
  name: `${from} to ${to}`,
  type: 'EX_STATION',
  typeSource: 'MANUAL',
  destinationName: to ?? '',
  distanceKm: '10',
  taPerKmRateOverridePaise: null,
  fromPlaceId: from,
  toPlaceId: to,
  status: 'active',
  ...over,
});

describe('the HQ workspace (2026-11-27)', () => {
  const town = place('town', { name: 'SILIGURI', type: 'HQ', isHqTown: true });
  const nax = place('nax', { name: 'Naxalbari' });
  const ran = place('ran', { name: 'Rangapani' });
  const off = place('off', { name: 'Aaa old', status: 'inactive' });

  it('pins the HQ town first, finds each place’s route to the town either way round, and counts what is missing', () => {
    const view = buildHqWorkspace([nax, off, ran, town], [route('r1', 'nax', 'town'), route('r2', 'nax', 'ran'), route('r3', 'town', 'mainaguri')]);
    expect(view.places.map((r) => [r.place.name, r.townRoute?.id ?? null])).toEqual([
      ['SILIGURI', null],
      ['Naxalbari', 'r1'],
      ['Rangapani', null],
      ['Aaa old', null],
    ]);
    expect(view.otherRoutes.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(view.counts).toEqual({ places: 4, routes: 3, missing: 1 });
  });

  it('an inactive route to the town still counts as missing; a route from before places is an other route', () => {
    const view = buildHqWorkspace([town, nax], [route('r1', 'town', 'nax', { status: 'inactive' }), route('old', null, null)]);
    expect(view.places[1]!.townRoute?.id).toBe('r1');
    expect(view.counts.missing).toBe(1);
    expect(view.otherRoutes.map((r) => r.id)).toEqual(['old']);
  });
});
