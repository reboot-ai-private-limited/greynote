import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import { AssignChemistUseCase, ListChemistAssignmentsUseCase, ListTeamChemistsUseCase, UnassignChemistUseCase } from './chemistAssignments.usecase.js';
import { FakeChemistAssignments, FakeChemists, FakeUsers } from './fmdTestKit.js';

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

const page = { page: 1, pageSize: 20 };
const field = (id: string) => ({ id, role: 'FIELD' as const });
const chemist = (id: string, name: string, over: Partial<Chemist> = {}): Chemist => ({
  id, routeId: 'route-1', name, address: 'x', phone: null, location: null, capturedLocation: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: null, ...over,
});

describe('chemist assignments (many MRs per chemist)', () => {
  let chemists: FakeChemists;
  let assignments: FakeChemistAssignments;
  let users: FakeUsers;
  let assign: AssignChemistUseCase;
  let unassign: UnassignChemistUseCase;
  let team: ListTeamChemistsUseCase;

  beforeEach(() => {
    chemists = new FakeChemists();
    chemists.rows.push(chemist('c1', 'Apollo Pharmacy'), chemist('c2', 'Zen Medico'), chemist('c3', 'Old Store', { status: 'inactive' }));
    assignments = new FakeChemistAssignments();
    users = new FakeUsers();
    assign = new AssignChemistUseCase(chemists, assignments, users);
    unassign = new UnassignChemistUseCase(assignments);
    team = new ListTeamChemistsUseCase(chemists, assignments, users);
  });

  it('two MRs can hold one chemist; assigning the same MR again is a no-op', async () => {
    await assign.execute('c1', 'mr1', 'admin');
    await assign.execute('c1', 'mr2', 'admin');
    const again = await assign.execute('c1', 'mr1', 'admin');
    expect(assignments.rows.filter((r) => r.status === 'active')).toHaveLength(2);
    expect(again.userId).toBe('mr1');
  });

  it('removing one MR leaves the other holding the chemist, and the removed row stays as history', async () => {
    await assign.execute('c1', 'mr1', 'admin');
    await assign.execute('c1', 'mr2', 'admin');
    await unassign.execute('c1', 'mr1', 'admin');
    expect((await assignments.listActiveForChemist('c1')).map((r) => r.userId)).toEqual(['mr2']);
    const history = await new ListChemistAssignmentsUseCase(assignments, users).execute('c1');
    expect(history.map((h) => [h.userId, h.status])).toEqual([['mr2', 'active'], ['mr1', 'inactive']]);
    await expectStatus(unassign.execute('c1', 'mr1', 'admin'), 404);
  });

  it('refuses an unknown or inactive chemist, and an employee who is not an active field employee', async () => {
    await expectStatus(assign.execute('nope', 'mr1', 'admin'), 404);
    await expectStatus(assign.execute('c3', 'mr1', 'admin'), 409);
    await expectStatus(assign.execute('c1', 'admin', 'admin'), 400);
    await expectStatus(assign.execute('c1', 'gone', 'admin'), 409);
    await expectStatus(assign.execute('c1', 'missing', 'admin'), 400);
  });

  describe('a manager’s team list (computed, nothing copied)', () => {
    beforeEach(async () => {
      await assign.execute('c1', 'mr1', 'admin');
      await assign.execute('c1', 'mr2', 'admin');
      await assign.execute('c2', 'mr2', 'admin');
    });

    it('lists each chemist once, with every MR in the team who holds it', async () => {
      const r = await team.execute(field('asm'), page);
      expect(r.items.map((c) => c.name)).toEqual(['Apollo Pharmacy', 'Zen Medico']);
      expect(r.items[0]!.assignedTo.map((a) => a.userId).sort()).toEqual(['mr1', 'mr2']);
    });

    it('when an MR leaves, the chemist they alone held drops out and a shared one stays', async () => {
      await assignments.endAllForUser('mr2', 'admin');
      expect((await team.execute(field('asm'), page)).items.map((c) => c.name)).toEqual(['Apollo Pharmacy']);
    });

    it('narrows to one report, finds by MR name, and refuses someone outside the team', async () => {
      expect((await team.execute(field('asm'), { ...page, userId: 'mr1' })).items.map((c) => c.id)).toEqual(['c1']);
      expect((await team.execute(field('asm'), { ...page, search: 'ben' })).items.map((c) => c.id)).toEqual(['c1', 'c2']); // mr2 is "Ben MR"
      await expectStatus(team.execute(field('stranger'), { ...page, userId: 'mr1' }), 403);
      expect((await team.execute(field('stranger'), page)).total).toBe(0);
    });
  });
});
