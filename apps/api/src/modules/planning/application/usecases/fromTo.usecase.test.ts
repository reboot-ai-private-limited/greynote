import { describe, expect, it } from 'vitest';
import type { PlanDay } from '../../domain/plan.js';
import { PlanPlaces } from '../planPlaces.js';
import { PlanPlacesUseCase } from './planPlaces.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';

/** Siliguri (town) ↔ Naxalbari (route r-nax); Jalpaiguri (town) ↔ Mainaguri (route r-main), the MR's HQ; Siliguri ↔ Mainaguri (r-cross). */
function setup() {
  const kit = planningKit(new Clock(new Date('2026-12-01T05:00:00Z')));
  kit.users.add('zsm', { level: 4 });
  kit.users.add('mr', { level: 1, managerId: 'zsm' });
  kit.routes.ends.set('r-nax', { from: 'slg', to: 'nax' });
  kit.routes.ends.set('r-main', { from: 'jal', to: 'main' });
  kit.routes.ends.set('r-cross', { from: 'slg', to: 'main' });
  kit.routes.byUser.set('zsm', ['r-nax', 'r-cross']);
  kit.routes.byUser.set('mr', ['r-main']);
  kit.routes.placesByUser.set('zsm', ['slg', 'nax']);
  kit.routes.placesByUser.set('mr', ['jal', 'main']);
  return kit;
}
const day = (over: Partial<PlanDay>): PlanDay => ({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [], fromPlaceId: null, toPlaceId: null, remarks: null, ...over });

describe('a Tour Plan day is one From → To along a typed route (2026-11-26)', () => {
  it('From and To bring the route between them, whichever way it was typed; From = To is a day at one place, with no route', async () => {
    const { routes } = setup();
    const places = new PlanPlaces(routes);
    expect((await places.normalize(day({ fromPlaceId: 'main', toPlaceId: 'slg' }))).routeIds).toEqual(['r-cross']);
    expect((await places.normalize(day({ fromPlaceId: 'nax', toPlaceId: 'nax', routeIds: ['x'] }))).routeIds).toEqual([]);
  });

  it('refuses two places with no typed route between them', async () => {
    const { routes } = setup();
    await expect(new PlanPlaces(routes).normalize(day({ fromPlaceId: 'nax', toPlaceId: 'main' }))).rejects.toMatchObject({ statusCode: 400, publicDetails: { field: 'toPlaceId' } });
  });

  it("an older phone's single route brings its two places; several routes stay as they were", async () => {
    const { routes } = setup();
    const places = new PlanPlaces(routes);
    expect(await places.normalize(day({ routeIds: ['r-nax'] }))).toMatchObject({ fromPlaceId: 'slg', toPlaceId: 'nax' });
    expect(await places.normalize(day({ routeIds: ['r-nax', 'r-cross'] }))).toMatchObject({ fromPlaceId: null, toPlaceId: null });
  });

  it("an MR may plan places of their own HQ only; a manager also their team's HQs", async () => {
    const { submitter } = setup();
    await expect(submitter.validateDays('mr', [{ day: day({ fromPlaceId: 'jal', toPlaceId: 'main', routeIds: ['r-main'] }), field: '' }])).resolves.toBeUndefined();
    await expect(submitter.validateDays('mr', [{ day: day({ fromPlaceId: 'nax', toPlaceId: 'nax' }), field: '' }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(submitter.validateDays('zsm', [{ day: day({ fromPlaceId: 'main', toPlaceId: 'main' }), field: '' }])).resolves.toBeUndefined();
    await expect(submitter.validateDays('zsm', [{ day: day({ fromPlaceId: 'slg', toPlaceId: 'main', routeIds: ['r-cross'] }), field: '' }])).resolves.toBeUndefined();
  });

  it('needs both ends, and none on a meeting', async () => {
    const { submitter } = setup();
    await expect(submitter.validateDays('mr', [{ day: day({ fromPlaceId: 'jal' }), field: '' }])).rejects.toMatchObject({ publicDetails: { field: 'toPlaceId' } });
    await expect(submitter.validateDays('mr', [{ day: day({ workingType: 'MEETING', fromPlaceId: 'jal', toPlaceId: 'jal' }), field: '' }])).rejects.toMatchObject({ statusCode: 400 });
  });

  it("the day's doctors are the ones at its To place", async () => {
    const { carryOver, doctors } = setup();
    doctors.set('mr', [
      { id: 'd-main', routeId: 'r-main', placeId: 'main' } as { id: string; routeId: string },
      { id: 'd-jal', routeId: 'r-main', placeId: 'jal' } as { id: string; routeId: string },
    ]);
    const plan = { userId: 'mr', planDate: '2026-12-02', routeIds: ['r-main'], toPlaceId: 'main' };
    await expect(carryOver.compose(plan, ['d-main'])).resolves.toEqual([{ doctorId: 'd-main', carriedFrom: null }]);
    await expect(carryOver.compose(plan, ['d-jal'])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a day at one place (From = To) can be saved with the doctors there, though it has no route (2026-11-27)', async () => {
    const kit = setup();
    kit.doctors.set('mr', [{ id: 'd-main', routeId: 'r-main', placeId: 'main' } as { id: string; routeId: string }]);
    await kit.dailyPlans.createInherited('mr', '2026-12-02', day({ fromPlaceId: 'main', toPlaceId: 'main' }));
    const saved = await kit.setDay.execute('mr', '2026-12-02', { workingType: 'FIELD_WORK', workWith: [], doctorIds: ['d-main'] });
    expect(saved).toMatchObject({ routeIds: [], fromPlaceId: 'main', toPlaceId: 'main' });
    expect(saved.doctors.map((d) => d.doctorId)).toEqual(['d-main']);
  });

  it("the pickers: the places of the owner's HQ (a manager's team too), and from a place only where a typed route goes, plus staying", async () => {
    const { routes, users, scope } = setup();
    const useCase = new PlanPlacesUseCase(routes as never, users, scope);
    expect((await useCase.places({ id: 'mr', role: 'FIELD' })).map((p) => p.id).sort()).toEqual(['jal', 'main']);
    expect((await useCase.places({ id: 'zsm', role: 'FIELD' })).map((p) => p.id).sort()).toEqual(['jal', 'main', 'nax', 'slg']);
    const fromSlg = await useCase.destinations({ id: 'zsm', role: 'FIELD' }, 'slg');
    expect(fromSlg.map((d) => [d.place.id, d.routeId, d.stay])).toEqual([
      ['slg', null, true],
      ['main', 'r-cross', false],
      ['nax', 'r-nax', false],
    ]);
    await expect(useCase.destinations({ id: 'mr', role: 'FIELD' }, 'slg')).rejects.toMatchObject({ statusCode: 400 });
    await expect(useCase.places({ id: 'mr', role: 'FIELD' }, 'zsm')).rejects.toMatchObject({ statusCode: 403 });
  });
});
