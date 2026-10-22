import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DoctorViews } from '../doctorViews.js';
import { DoctorVisibility } from '../doctorVisibility.js';
import { AssignDoctorUseCase } from './assignDoctor.usecase.js';
import { CreateDoctorUseCase } from './createDoctor.usecase.js';
import { FakeAssignments, FakeConfig, FakeDoctors, FakeTerritory, FakeTransactions, FakeUsers, FakeSpecialties, retirementKit } from './fmdTestKit.js';
import { GetDoctorUseCase } from './getDoctor.usecase.js';
import { ListAssignedDoctorsUseCase } from './listAssignedDoctors.usecase.js';
import { ListDoctorAssignmentsUseCase } from './listDoctorAssignments.usecase.js';
import { ListDoctorsUseCase } from './listDoctors.usecase.js';
import { UnassignDoctorUseCase } from './unassignDoctor.usecase.js';
import { UpdateDoctorUseCase } from './updateDoctor.usecase.js';
import { SpecialtyCatalog } from '../specialtyCatalog.js';

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

const page = { page: 1, pageSize: 20 };
const admin = { id: 'admin', role: 'ADMIN' as const };
const field = (id: string) => ({ id, role: 'FIELD' as const });
const doctorInput = {
  routeId: 'route-1',
  name: 'Dr Rao',
  address: '5 Clinic Rd',
  email: null,
  specialty: 'Cardiology',
  qualification: 'MD',
  location: { latitude: 26.7, longitude: 88.4 },
};

describe('Doctors', () => {
  let assignments: FakeAssignments;
  let doctors: FakeDoctors;
  let territory: FakeTerritory;
  let users: FakeUsers;
  let config: FakeConfig;
  let views: DoctorViews;
  let visibility: DoctorVisibility;

  const create = (over: Partial<typeof doctorInput> = {}) => new CreateDoctorUseCase(doctors, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiology']))).execute({ ...doctorInput, ...over }, 'admin');
  const assign = (doctorId: string, userId: string) => new AssignDoctorUseCase(doctors, assignments, users, territory, new FakeTransactions(), retirementKit(doctors, assignments, users).retirement).execute(doctorId, userId, 'admin');
  const get = (actor: { id: string; role: 'ADMIN' | 'FIELD' }, id: string) => new GetDoctorUseCase(doctors, visibility, views).execute(actor, id);
  const listed = { run: () => new ListAssignedDoctorsUseCase(doctors, visibility, users, views) };

  beforeEach(() => {
    assignments = new FakeAssignments();
    doctors = new FakeDoctors(assignments);
    territory = new FakeTerritory();
    users = new FakeUsers();
    config = new FakeConfig();
    views = new DoctorViews(assignments, users);
    visibility = new DoctorVisibility(assignments, territory, users, config);
    territory.userRoutes.set('mr1', ['route-1']);
    territory.userRoutes.set('mr2', ['route-2']);
  });

  describe('Admin master data', () => {
    it('creates an active Doctor with an approval date, on an active route only', async () => {
      const d = await create();
      expect(d).toMatchObject({ status: 'active', addedBy: 'admin', assignedTo: null });
      expect(d.approvedAt).toBeInstanceOf(Date);
      await expectStatus(create({ routeId: 'route-x' }), 404);
      await expectStatus(create({ routeId: 'route-off' }), 409);
    });

    it('edits, corrects the location, and moves only to an active route', async () => {
      const d = await create();
      const update = new UpdateDoctorUseCase(doctors, assignments, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiology'])), new FakeTransactions(), retirementKit(doctors, assignments, users).retirement);
      expect((await update.execute(d.id, { location: { latitude: 1, longitude: 2 } })).location).toEqual({ latitude: 1, longitude: 2 });
      expect((await update.execute(d.id, { location: null })).location).toBeNull();
      expect((await update.execute(d.id, { routeId: 'route-2' })).routeId).toBe('route-2');
      await expectStatus(update.execute(d.id, { routeId: 'route-off' }), 409);
      await expectStatus(update.execute('nope', { name: 'x' }), 404);
    });

    it('lists with the assigned MR attached, filtered by route and name', async () => {
      const a = await create();
      await create({ routeId: 'route-2', name: 'Dr Sen' });
      await assign(a.id, 'mr1');
      const list = new ListDoctorsUseCase(doctors, views);
      const all = await list.execute(page);
      expect(all.items.find((d) => d.id === a.id)?.assignedTo).toEqual({ userId: 'mr1', name: 'Asha MR', employeeCode: 'E1' });
      expect((await list.execute({ ...page, routeId: 'route-2' })).items.map((d) => d.name)).toEqual(['Dr Sen']);
      expect((await list.execute({ ...page, search: 'rao' })).total).toBe(1);
    });
  });

  describe('Assignments', () => {
    it('assigns an active FIELD employee who has the Doctor’s route', async () => {
      const d = await create();
      expect(await assign(d.id, 'mr1')).toMatchObject({ doctorId: d.id, userId: 'mr1', status: 'active' });
    });

    it('refuses an MR without the route, a non-FIELD or inactive or unknown user, and an inactive Doctor', async () => {
      const d = await create();
      await expectStatus(assign(d.id, 'mr2'), 409); // has route-2 only
      await expectStatus(assign(d.id, 'admin'), 400);
      await expectStatus(assign(d.id, 'nobody'), 400);
      territory.userRoutes.set('gone', ['route-1']);
      await expectStatus(assign(d.id, 'gone'), 409);
      await new UpdateDoctorUseCase(doctors, assignments, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiology'])), new FakeTransactions(), retirementKit(doctors, assignments, users).retirement).execute(d.id, { status: 'inactive' }, 'admin');
      await expectStatus(assign(d.id, 'mr1'), 409);
      await expectStatus(assign('nope', 'mr1'), 404);
    });

    it('replaces the current MR and keeps history; assigning the same MR again changes nothing', async () => {
      const d = await create();
      territory.userRoutes.set('mr2', ['route-1', 'route-2']);
      const first = await assign(d.id, 'mr1');
      expect((await assign(d.id, 'mr1')).id).toBe(first.id);
      await assign(d.id, 'mr2');
      const history = await new ListDoctorAssignmentsUseCase(doctors, assignments).execute(d.id);
      expect(history.map((a) => [a.userId, a.status])).toEqual([
        ['mr2', 'active'],
        ['mr1', 'inactive'],
      ]);
      expect(assignments.rows.filter((a) => a.doctorId === d.id && a.status === 'active')).toHaveLength(1);
    });

    it('removes an assignment only for the MR who holds it', async () => {
      const d = await create();
      await assign(d.id, 'mr1');
      const unassign = new UnassignDoctorUseCase(assignments, retirementKit(doctors, assignments, users).retirement);
      await expectStatus(unassign.execute(d.id, 'mr2', 'admin'), 404);
      await unassign.execute(d.id, 'mr1', 'admin');
      expect(await assignments.findActiveForDoctor(d.id)).toBeNull();
    });
  });

  describe('Who sees a Doctor', () => {
    it('an MR sees their assigned Doctors; a manager sees the downline’s; a stranger sees none', async () => {
      const d = await create();
      const other = await create({ routeId: 'route-2', name: 'Dr Sen' });
      await assign(d.id, 'mr1');
      await assign(other.id, 'mr2');
      const list = listed.run();
      expect((await list.mine(field('mr1'), page)).items.map((x) => x.name)).toEqual(['Dr Rao']);
      expect((await list.team(field('asm'), page)).items.map((x) => x.name)).toEqual(['Dr Rao', 'Dr Sen']);
      expect((await list.team(field('asm'), { ...page, userId: 'mr2' })).items.map((x) => x.name)).toEqual(['Dr Sen']);
      expect((await list.mine(field('stranger'), page)).total).toBe(0);
      expect((await list.team(field('stranger'), page)).total).toBe(0);
      await expectStatus(list.team(field('stranger'), { ...page, userId: 'mr1' }), 403);
    });

    it('detail: Admin, the MR and their manager see it; anyone else gets a 404', async () => {
      const d = await create();
      await assign(d.id, 'mr1');
      for (const actor of [admin, field('mr1'), field('asm')]) expect((await get(actor, d.id)).id).toBe(d.id);
      await expectStatus(get(field('mr2'), d.id), 404);
      await expectStatus(get(field('stranger'), d.id), 404);
      await expectStatus(get(field('mr1'), 'nope'), 404);
    });

    it('losing the route hides the Doctor (switch on), but a returned route brings it back and Admin still sees it', async () => {
      const d = await create();
      await assign(d.id, 'mr1');
      territory.userRoutes.set('mr1', ['route-2']); // route-1 taken away
      const list = listed.run();
      expect((await list.mine(field('mr1'), page)).total).toBe(0);
      expect((await list.team(field('asm'), page)).total).toBe(0);
      await expectStatus(get(field('mr1'), d.id), 404);
      await expectStatus(get(field('asm'), d.id), 404);
      expect((await get(admin, d.id)).assignedTo?.userId).toBe('mr1');
      expect(await visibility.isVisibleToAssignee('mr1', (await doctors.findById(d.id))!)).toBe(false);
      expect(assignments.rows[0]!.status).toBe('active'); // hidden when read, never rewritten
      territory.userRoutes.set('mr1', ['route-1']);
      expect((await list.mine(field('mr1'), page)).total).toBe(1);
      expect(await visibility.isVisibleToAssignee('mr1', (await doctors.findById(d.id))!)).toBe(true);
    });

    it('with the switch off, an MR keeps their Doctors after losing the route', async () => {
      config.values.set('DOCTOR_VISIBILITY_FOLLOWS_ROUTE', 'false');
      const d = await create();
      await assign(d.id, 'mr1');
      territory.userRoutes.set('mr1', []);
      expect((await listed.run().mine(field('mr1'), page)).total).toBe(1);
      expect((await get(field('mr1'), d.id)).id).toBe(d.id);
      expect(await visibility.isVisibleToAssignee('mr1', (await doctors.findById(d.id))!)).toBe(true);
    });

    it('a malformed switch value is a fault naming the key, never silently a default', async () => {
      config.values.set('DOCTOR_VISIBILITY_FOLLOWS_ROUTE', 'maybe');
      await expectStatus(listed.run().mine(field('mr1'), page), 500);
    });

    it('an inactive Doctor is not visible to its MR or manager, only to Admin', async () => {
      const d = await create();
      await assign(d.id, 'mr1');
      await doctors.update(d.id, { status: 'inactive' }); // e.g. deactivated straight in the data
      expect((await listed.run().mine(field('mr1'), page)).total).toBe(0);
      await expectStatus(get(field('mr1'), d.id), 404);
      expect((await get(admin, d.id)).status).toBe('inactive');
    });
  });

  describe('Taking a doctor out of service', () => {
    const kit = () => retirementKit(doctors, assignments, users);
    const updater = (r: ReturnType<typeof kit>) =>
      new UpdateDoctorUseCase(doctors, assignments, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiology'])), new FakeTransactions(), r.retirement);

    it('deactivates an assigned doctor in one step: the assignment ends and every editable plan loses it', async () => {
      const r = kit();
      const d = await create();
      await assign(d.id, 'mr1');
      expect((await updater(r).execute(d.id, { status: 'inactive' }, 'admin')).status).toBe('inactive');
      expect(await assignments.findActiveForDoctor(d.id)).toBeNull();
      expect(assignments.rows.find((a) => a.doctorId === d.id)).toMatchObject({ status: 'inactive', unassignedBy: 'admin' });
      expect(r.references.released).toEqual([{ doctorId: d.id, userId: null }]);
      // Editing an inactive doctor is allowed, and touches no plan.
      expect((await updater(r).execute(d.id, { name: 'Dr Rao (retired)' }, 'admin')).name).toBe('Dr Rao (retired)');
      expect(r.references.released).toHaveLength(1);
    });

    it('takes the doctor off the plans of an MR who loses it: unassigned, or replaced', async () => {
      const r = kit();
      const d = await create();
      territory.userRoutes.set('mr2', ['route-1']);
      const assignWith = (userId: string) => new AssignDoctorUseCase(doctors, assignments, users, territory, new FakeTransactions(), r.retirement).execute(d.id, userId, 'admin');
      await assignWith('mr1');
      expect(r.references.released).toEqual([]);
      await assignWith('mr2');
      expect(r.references.released).toEqual([{ doctorId: d.id, userId: 'mr1' }]);
      await new UnassignDoctorUseCase(assignments, r.retirement).execute(d.id, 'mr2', 'admin');
      expect(r.references.released).toEqual([{ doctorId: d.id, userId: 'mr1' }, { doctorId: d.id, userId: 'mr2' }]);
    });

    it('shows the impact: who has it, plans, history, open gifts and services, samples left, visuals', async () => {
      const r = kit();
      const d = await create();
      await assign(d.id, 'mr1');
      r.allocations.rows.push(
        { id: 'a1', doctorId: d.id, productId: 'p1', quantityAllocated: 10, quantityRemaining: 4 } as never,
        { id: 'a2', doctorId: d.id, productId: 'p2', quantityAllocated: 5, quantityRemaining: 5 } as never,
      );
      r.references.counts = { plannedDays: { editable: 3, locked: 1 }, calls: 12, openGifts: 1, openServices: 2, visuals: 4 };
      expect(await r.retirement.impact(d.id)).toEqual({
        id: d.id,
        name: d.name,
        status: 'active',
        assignedTo: { userId: 'mr1', name: 'Asha MR', employeeCode: 'E1' },
        plannedDays: { editable: 3, locked: 1 },
        calls: 12,
        openGifts: 1,
        openServices: 2,
        sampleAllocations: 2,
        samplesRemaining: 9,
        visuals: 4,
      });
      await expectStatus(r.retirement.impact('nope'), 404);
    });

    it('deletes for good: archived with its last MR, assignments gone, every editable plan cleaned; history still finds it as inactive', async () => {
      const r = kit();
      const d = await create();
      await assign(d.id, 'mr1');
      expect(await r.retirement.delete(d.id, 'admin')).toEqual({ id: d.id, plansUpdated: 1 });
      expect(await doctors.findById(d.id)).toBeNull();
      expect(assignments.rows.filter((a) => a.doctorId === d.id)).toEqual([]);
      expect(r.archive.rows.get(d.id)).toMatchObject({ lastAssignedUserId: 'mr1', deletedBy: 'admin' });
      expect(r.references.released).toEqual([{ doctorId: d.id, userId: null }]);
      expect(await r.retirement.findIncludingDeleted(d.id)).toMatchObject({ id: d.id, name: d.name, status: 'inactive' });
      // Gone for the screens: a second delete and Admin's own read are 404.
      await expectStatus(r.retirement.delete(d.id, 'admin'), 404);
      await expectStatus(get({ id: 'admin', role: 'ADMIN' }, d.id), 404);
    });

    it('leaves a doctor waiting for approval to the approval: no impact, no delete', async () => {
      const r = kit();
      const d = await create();
      doctors.rows.find((x) => x.id === d.id)!.status = 'pending';
      await expectStatus(r.retirement.impact(d.id), 409);
      await expectStatus(r.retirement.delete(d.id, 'admin'), 409);
    });

    it('a failed plan clean-up doesn’t undo the deactivation', async () => {
      const r = kit();
      r.references.release = async () => {
        throw new Error('planning down');
      };
      const d = await create();
      expect((await updater(r).execute(d.id, { status: 'inactive' }, 'admin')).status).toBe('inactive');
    });
  });
});

