import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DoctorViews } from '../doctorViews.js';
import { DoctorVisibility } from '../doctorVisibility.js';
import { AssignDoctorUseCase } from './assignDoctor.usecase.js';
import { CreateDoctorUseCase } from './createDoctor.usecase.js';
import { FakeAssignments, FakeConfig, FakeDoctors, FakeTerritory, FakeTransactions, FakeUsers } from './fmdTestKit.js';
import { GetDoctorUseCase } from './getDoctor.usecase.js';
import { ListAssignedDoctorsUseCase } from './listAssignedDoctors.usecase.js';
import { ListDoctorAssignmentsUseCase } from './listDoctorAssignments.usecase.js';
import { ListDoctorsUseCase } from './listDoctors.usecase.js';
import { UnassignDoctorUseCase } from './unassignDoctor.usecase.js';
import { UpdateDoctorUseCase } from './updateDoctor.usecase.js';

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
  category: 'A',
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

  const create = (over: Partial<typeof doctorInput> = {}) => new CreateDoctorUseCase(doctors, territory, views).execute({ ...doctorInput, ...over }, 'admin');
  const assign = (doctorId: string, userId: string) => new AssignDoctorUseCase(doctors, assignments, users, territory, new FakeTransactions()).execute(doctorId, userId, 'admin');
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
      const update = new UpdateDoctorUseCase(doctors, assignments, territory, views);
      expect((await update.execute(d.id, { location: { latitude: 1, longitude: 2 } })).location).toEqual({ latitude: 1, longitude: 2 });
      expect((await update.execute(d.id, { location: null })).location).toBeNull();
      expect((await update.execute(d.id, { routeId: 'route-2' })).routeId).toBe('route-2');
      await expectStatus(update.execute(d.id, { routeId: 'route-off' }), 409);
      await expectStatus(update.execute('nope', { name: 'x' }), 404);
    });

    it('refuses to deactivate a Doctor who has an assigned MR, and allows it once unassigned', async () => {
      const d = await create();
      await assign(d.id, 'mr1');
      const update = new UpdateDoctorUseCase(doctors, assignments, territory, views);
      await expectStatus(update.execute(d.id, { status: 'inactive' }), 409);
      await new UnassignDoctorUseCase(assignments).execute(d.id, 'mr1', 'admin');
      expect((await update.execute(d.id, { status: 'inactive' })).status).toBe('inactive');
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
      await new UpdateDoctorUseCase(doctors, assignments, territory, views).execute(d.id, { status: 'inactive' });
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
      const unassign = new UnassignDoctorUseCase(assignments);
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
});
