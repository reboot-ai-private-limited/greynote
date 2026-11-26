import { describe, expect, it } from 'vitest';
import { FakeTerritory } from './usecases/fmdTestKit.js';
import { resolveOwnPlace, resolvePlace } from './requireActiveRoute.js';

describe('doctors and chemists sit on a place (2026-11-26)', () => {
  it('a place given directly keeps its anchor route; a route from an older client means its To place', async () => {
    const t = new FakeTerritory();
    expect(await resolvePlace(t, { placeId: 'p-route-2' })).toEqual({ placeId: 'p-route-2', routeId: 'route-2' });
    expect(await resolvePlace(t, { routeId: 'route-1' })).toEqual({ placeId: 'p-route-1', routeId: 'route-1' });
  });

  it('refuses no place, an unknown place and an inactive one', async () => {
    const t = new FakeTerritory();
    await expect(resolvePlace(t, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(resolvePlace(t, { placeId: 'p-nope' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(resolvePlace(t, { placeId: 'p-route-off' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("an employee adds only on a place of their HQ; the phone's refusal still names the route", async () => {
    const t = new FakeTerritory();
    t.userRoutes.set('mr', ['route-1']);
    expect(await resolveOwnPlace(t, 'mr', { placeId: 'p-route-1' })).toEqual({ placeId: 'p-route-1', routeId: 'route-1' });
    await expect(resolveOwnPlace(t, 'mr', { placeId: 'p-route-3' })).rejects.toMatchObject({ statusCode: 400, publicDetails: { field: 'placeId' } });
    await expect(resolveOwnPlace(t, 'mr', { routeId: 'route-3' })).rejects.toMatchObject({ statusCode: 400, publicDetails: { field: 'routeId' } });
  });
});
