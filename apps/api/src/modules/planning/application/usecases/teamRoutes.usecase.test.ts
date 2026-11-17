import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { Clock, planningKit } from './planningTestKit.js';
import { ListTeamRoutesUseCase, RouteOptionsUseCase } from './teamRoutes.usecase.js';

const ZSM = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const RSM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const MR1 = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const MR2 = 'aaaaaaaaaaaaaaaaaaaaaaa5';
const OUTSIDER = 'aaaaaaaaaaaaaaaaaaaaaaa6';
const R1 = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const R3 = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const R_OUT = 'bbbbbbbbbbbbbbbbbbbbbbb4';

async function status(p: Promise<unknown>): Promise<number | 'ok'> {
  return p.then(() => 'ok' as const, (e: unknown) => (e instanceof AppError ? e.statusCode : 500));
}

describe('a manager’s route pickers (route first)', () => {
  let kit: ReturnType<typeof planningKit>;
  let teamRoutes: ListTeamRoutesUseCase;
  let options: RouteOptionsUseCase;
  const page = { page: 1, pageSize: 20 };

  beforeEach(() => {
    kit = planningKit(new Clock(new Date('2026-10-05T04:00:00Z')));
    kit.users.add(ZSM, { level: 4 });
    kit.users.add(RSM, { level: 3, managerId: ZSM });
    kit.users.add(ASM, { level: 2, managerId: RSM });
    kit.users.add(MR1, { level: 1, managerId: ASM });
    kit.users.add(MR2, { level: 1, managerId: ASM });
    kit.users.add(OUTSIDER, { level: 1 });
    kit.users.designations.set(ASM, 'ASM');
    kit.users.designations.set(MR1, 'MR');
    kit.routes.byUser.set(MR1, [R1]);
    kit.routes.byUser.set(MR2, [R2, R3]);
    kit.routes.byUser.set(OUTSIDER, [R_OUT]);
    kit.doctors.set(MR1, [{ id: 'd1', routeId: R1, name: 'Dr One' }, { id: 'd1b', routeId: R1, name: 'Dr Alpha' }] as never);
    kit.doctors.set(MR2, [{ id: 'd2', routeId: R2, name: 'Dr Two' }] as never);
    teamRoutes = new ListTeamRoutesUseCase(kit.users, kit.routes, kit.scope, kit.carryOver);
    options = new RouteOptionsUseCase(kit.users, kit.routes, kit.scope, kit.carryOver);
  });

  describe('team routes: the routes held by anyone below the manager', () => {
    it('lists them with who holds each and how many doctors are on it, and never the routes of someone outside the line', async () => {
      const r = await teamRoutes.execute(RSM, page);
      expect(r.items.map((x) => [x.id, x.holders.map((h) => h.id), x.doctorCount])).toEqual([[R1, [MR1], 2], [R2, [MR2], 1], [R3, [MR2], 0]]);
      expect(r.items.map((x) => x.id)).not.toContain(R_OUT);
      expect(r.hqs).toEqual([{ id: 'hq-1', name: 'HQ 1', routes: 3 }]);
    });

    it('is the same for a manager one level up, and pages and searches without loading everything', async () => {
      expect((await teamRoutes.execute(ZSM, page)).total).toBe(3);
      expect((await teamRoutes.execute(ZSM, { page: 2, pageSize: 2 })).items.map((x) => x.id)).toEqual([R3]);
      expect((await teamRoutes.execute(ZSM, { ...page, search: 'route bbbbbbbbbbbbbbbbbbbbbbb2' })).items.map((x) => x.id)).toEqual([R2]);
      expect((await teamRoutes.execute(ZSM, { ...page, hqId: 'hq-other' })).total).toBe(0);
    });

    it('follows the team at once: a route handed back leaves the list', async () => {
      kit.routes.byUser.set(MR2, [R2]);
      expect((await teamRoutes.execute(RSM, page)).items.map((x) => x.id)).toEqual([R1, R2]);
    });

    it('is a manager’s tool: an MR gets 403', async () => {
      expect(await status(teamRoutes.execute(MR1, page))).toBe(403);
    });
  });

  describe('route options: what Works with and Doctors offer once the route is chosen', () => {
    it('offers the holders and the managers above them, with the chosen routes in brackets, and only the doctors on those routes', async () => {
      const o = await options.execute(RSM, [R1]);
      expect(o.people.map((p) => [p.id, p.routes.map((r) => r.id)])).toEqual([[ASM, [R1]], [MR1, [R1]]]);
      expect(o.people.find((p) => p.id === MR1)?.label).toBe(`${MR1} (MR)`);
      expect(o.doctors.map((d) => d.id)).toEqual(['d1b', 'd1']); // by name; none from R2
    });

    it('a manager two levels up sees the ASM and the RSM between them and the MRs', async () => {
      const o = await options.execute(ZSM, [R1, R2]);
      expect(o.people.map((p) => p.id).sort()).toEqual([ASM, MR1, MR2, RSM].sort());
      expect(o.people.find((p) => p.id === RSM)?.routes.map((r) => r.id).sort()).toEqual([R1, R2]);
    });

    it('a route nobody below holds offers nobody and no doctors; someone outside the line is never offered', async () => {
      const o = await options.execute(RSM, [R_OUT]);
      expect(o.people).toEqual([]);
      expect(o.doctors).toEqual([]);
    });

    it('is a manager’s tool: an MR gets 403', async () => {
      expect(await status(options.execute(MR1, [R1]))).toBe(403);
    });
  });
});
