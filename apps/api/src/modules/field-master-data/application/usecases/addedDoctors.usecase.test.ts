import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { makeDoctorApprovalHandler, NEW_DOCTOR_KIND } from '../doctorApproval.js';
import { DoctorViews } from '../doctorViews.js';
import { DoctorVisibility } from '../doctorVisibility.js';
import { AddedDoctors, type AddedDoctorInput } from './addedDoctors.js';
import { FakeApprovals, FakeAssignments, FakeConfig, FakeDoctors, FakeTerritory, FakeTransactions, FakeUsers, FakeSpecialties, retirementKit } from './fmdTestKit.js';
import { GetDoctorUseCase } from './getDoctor.usecase.js';
import { ListAssignedDoctorsUseCase } from './listAssignedDoctors.usecase.js';
import { ReviewPendingDoctorUseCase } from './reviewPendingDoctor.usecase.js';
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
const field = (id: string) => ({ id, role: 'FIELD' as const });
const admin = { id: 'admin', role: 'ADMIN' as const };
const phoneGps = { latitude: 26.71, longitude: 88.41 };
const input: AddedDoctorInput = {
  routeId: 'route-1',
  name: 'Dr Mehta',
  address: '9 Lake Rd',
  email: null,
  specialty: 'ENT',
  qualification: 'MS',
  location: phoneGps,
};

describe('An MR adds a Doctor', () => {
  let doctors: FakeDoctors;
  let assignments: FakeAssignments;
  let approvals: FakeApprovals;
  let territory: FakeTerritory;
  let users: FakeUsers;
  let config: FakeConfig;
  let views: DoctorViews;
  let visibility: DoctorVisibility;
  let added: AddedDoctors;

  const add = (over: Partial<AddedDoctorInput & { clientRequestId: string }> = {}, mr = 'mr1') =>
    added.add(mr, { ...input, clientRequestId: 'client-req-0001', ...over });
  const approve = () => approvals.decide(NEW_DOCTOR_KIND, 'doctor-1', 'APPROVED');

  beforeEach(() => {
    assignments = new FakeAssignments();
    doctors = new FakeDoctors(assignments);
    approvals = new FakeApprovals();
    territory = new FakeTerritory();
    users = new FakeUsers();
    config = new FakeConfig();
    config.values.set('AUTO_ASSIGN_DOCTOR_ON_APPROVAL', 'true');
    territory.userRoutes.set('mr1', ['route-1']);
    territory.userRoutes.set('mr2', ['route-2']);
    views = new DoctorViews(assignments, users);
    visibility = new DoctorVisibility(assignments, territory, users, config);
    added = new AddedDoctors(doctors, territory, approvals, new FakeTransactions(), views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiologist'])), users, config);
    approvals.registerKind({
      kind: NEW_DOCTOR_KIND,
      finalApproverRoles: ['ADMIN'],
      onStatusChange: makeDoctorApprovalHandler(doctors, assignments, users, territory, config),
    });
  });

  describe('when the add-doctor toggle is for managers', () => {
    beforeEach(() => territory.userRoutes.set('asm', ['route-1']));

    it('refuses a manager while MANAGER_CAN_ADD_DOCTORS is off', async () => {
      await expect(add({}, 'asm')).rejects.toMatchObject({ statusCode: 403 });
      expect(doctors.rows).toHaveLength(0);
    });

    it('refuses when the key is missing from Config (not yet seeded)', async () => {
      config.values.delete('MANAGER_CAN_ADD_DOCTORS');
      config.get = async (key: string) => {
        if (!config.values.has(key)) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
        return config.values.get(key)!;
      };
      await expect(add({}, 'asm')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets a manager add once Admin turns it on, and always lets an MR without a team add', async () => {
      config.values.set('MANAGER_CAN_ADD_DOCTORS', 'true');
      await expect(add({}, 'asm')).resolves.toMatchObject({ created: true });
      config.values.set('MANAGER_CAN_ADD_DOCTORS', 'false');
      await expect(add({ clientRequestId: 'client-req-0002' }, 'mr1')).resolves.toMatchObject({ created: true });
    });

    it('still returns a manager’s earlier Doctor on a retry after the toggle goes off', async () => {
      config.values.set('MANAGER_CAN_ADD_DOCTORS', 'true');
      await add({}, 'asm');
      config.values.set('MANAGER_CAN_ADD_DOCTORS', 'false');
      await expect(add({}, 'asm')).resolves.toMatchObject({ created: false });
    });
  });

  it('creates it pending with the phone location, and submits it for approval', async () => {
    const { doctor, created } = await add();
    expect(created).toBe(true);
    expect(doctor).toMatchObject({
      status: 'pending',
      addedBy: 'mr1',
      approvedAt: null,
      location: phoneGps,
      capturedLocation: phoneGps,
      assignedTo: null,
      approval: { cycle: 1, status: 'SUBMITTED' },
    });
    expect(approvals.requests).toHaveLength(1);
  });

  it('Admin’s list links a pending doctor to its approval request, and no other doctor', async () => {
    const { doctor } = await add();
    const withRequests = new DoctorViews(assignments, users, approvals);
    expect((await withRequests.one(doctor)).approvalRequestId).toBe(approvals.requests[0]!.id);
    expect((await withRequests.one({ ...doctor, status: 'active' })).approvalRequestId).toBeNull();
  });

  it('only on a route the MR has', async () => {
    await expectStatus(add({ routeId: 'route-2' }), 400);
    expect(doctors.rows).toHaveLength(0);
    expect(approvals.requests).toHaveLength(0);
  });

  it('a retry with the same clientRequestId returns the first Doctor — no second Doctor, no second request', async () => {
    const first = await add();
    const retry = await add({ name: 'Changed on the phone' });
    expect(retry.created).toBe(false);
    expect(retry.doctor.id).toBe(first.doctor.id);
    expect(doctors.rows).toHaveLength(1);
    expect(approvals.requests).toHaveLength(1);
    expect((await add({ clientRequestId: 'client-req-0002', name: 'Dr Other' })).created).toBe(true);
    expect(doctors.rows).toHaveLength(2);
  });

  it('two retries racing each other still make exactly one Doctor', async () => {
    const [a, b] = await Promise.all([add(), add()]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.doctor.id).toBe(b.doctor.id);
    expect(doctors.rows).toHaveLength(1);
    expect(approvals.requests).toHaveLength(1);
  });

  describe('approval', () => {
    it('makes it active, starts the wait from now, and assigns the MR who added it', async () => {
      await add();
      await approve();
      const d = doctors.rows[0]!;
      expect(d.status).toBe('active');
      expect(d.approvedAt).toBeInstanceOf(Date);
      expect(d.location).toEqual(phoneGps);
      expect(assignments.rows[0]).toMatchObject({ doctorId: d.id, userId: 'mr1', status: 'active', assignedBy: 'admin' });
      expect((await new ListAssignedDoctorsUseCase(doctors, visibility, users, views).mine(field('mr1'), page)).items.map((x) => x.name)).toEqual(['Dr Mehta']);
    });

    it('Admin can list any employee’s doctors; an unknown employee is a 404', async () => {
      await add();
      await approve();
      const list = new ListAssignedDoctorsUseCase(doctors, visibility, users, views);
      expect((await list.forUser('mr1', page)).items.map((x) => x.name)).toEqual(['Dr Mehta']);
      expect((await list.forUser('asm', page)).total).toBe(0);
      await expect(list.forUser('nobody', page)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('leaves it unassigned when AUTO_ASSIGN_DOCTOR_ON_APPROVAL is off', async () => {
      config.values.set('AUTO_ASSIGN_DOCTOR_ON_APPROVAL', 'false');
      await add();
      await approve();
      expect(doctors.rows[0]!.status).toBe('active');
      expect(assignments.rows).toHaveLength(0);
    });

    it('still approves, but leaves it for Admin, if the MR lost the route or was deactivated meanwhile', async () => {
      await add();
      territory.userRoutes.set('mr1', []);
      await approve();
      expect(doctors.rows[0]!.status).toBe('active');
      expect(assignments.rows).toHaveLength(0);

      await add({ clientRequestId: 'client-req-0002', name: 'Dr Two' }, 'mr1').catch(() => undefined);
      territory.userRoutes.set('mr1', ['route-1']);
      const { doctor } = await add({ clientRequestId: 'client-req-0003', name: 'Dr Three' });
      users.rows.find((u) => u.id === 'mr1')!.status = 'inactive';
      await approvals.decide(NEW_DOCTOR_KIND, doctor.id, 'APPROVED');
      expect(assignments.rows).toHaveLength(0);
    });

    it('is invisible to other modules and the field until approved; rejection and manager approval keep it pending', async () => {
      await add();
      const list = new ListAssignedDoctorsUseCase(doctors, visibility, users, views);
      await approvals.decide(NEW_DOCTOR_KIND, 'doctor-1', 'MANAGER_APPROVED', 'asm');
      await approvals.decide(NEW_DOCTOR_KIND, 'doctor-1', 'REJECTED');
      expect(doctors.rows[0]!.status).toBe('pending');
      expect((await list.mine(field('mr1'), page)).total).toBe(0);
      expect((await list.team(field('asm'), page)).total).toBe(0);
    });
  });

  describe('editing after a rejection', () => {
    it('changes it and resubmits as cycle 2, and the phone location is re-captured', async () => {
      await add();
      await approvals.decide(NEW_DOCTOR_KIND, 'doctor-1', 'REJECTED');
      const gps2 = { latitude: 26.72, longitude: 88.42 };
      const doctor = await added.edit('mr1', 'doctor-1', { ...input, name: 'Dr Mehta Jr', location: gps2 });
      expect(doctor).toMatchObject({ name: 'Dr Mehta Jr', status: 'pending', location: gps2, capturedLocation: gps2, approval: { cycle: 2, status: 'SUBMITTED' } });
    });

    it('not while it is waiting or after it is approved, not by someone else, and only to a route the MR has', async () => {
      await add();
      await expectStatus(added.edit('mr1', 'doctor-1', input), 409); // waiting
      await expectStatus(added.edit('mr2', 'doctor-1', input), 404); // not theirs
      await approvals.decide(NEW_DOCTOR_KIND, 'doctor-1', 'REJECTED');
      await expectStatus(added.edit('mr1', 'doctor-1', { ...input, routeId: 'route-2' }), 400);
      await added.edit('mr1', 'doctor-1', input);
      await approve();
      await expectStatus(added.edit('mr1', 'doctor-1', input), 409); // approved
      await expectStatus(added.edit('mr1', 'nope', input), 404);
    });

    it('an Admin-added Doctor is not one an MR can edit', async () => {
      const d = await doctors.create({ ...input, clinicName: null, phone: null, photo: null, dateOfBirth: null, anniversary: null, visitFrequency: null, capturedLocation: null, clientRequestId: null, status: 'active', addedBy: 'mr1', approvedAt: new Date() });
      await expectStatus(added.edit('mr1', d.id, input), 404);
    });
  });

  it('Admin reopening an approved Doctor sends it back to pending, keeping the assignment hidden until re-approved', async () => {
    await add();
    await approve();
    await approvals.decide(NEW_DOCTOR_KIND, 'doctor-1', 'REOPENED');
    expect(doctors.rows[0]).toMatchObject({ status: 'pending', approvedAt: null });
    expect((await new ListAssignedDoctorsUseCase(doctors, visibility, users, views).mine(field('mr1'), page)).total).toBe(0);
    await added.edit('mr1', 'doctor-1', input);
    await approve();
    expect(doctors.rows[0]!.status).toBe('active');
    expect(assignments.rows).toHaveLength(1); // not assigned twice
  });

  describe('Admin review', () => {
    it('can correct the location while it is pending, and the phone capture is kept', async () => {
      await add();
      const fixed = { latitude: 26.9, longitude: 88.5 };
      const updated = await new UpdateDoctorUseCase(doctors, assignments, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiologist'])), new FakeTransactions(), retirementKit(doctors, assignments, users).retirement).execute('doctor-1', { location: fixed });
      expect(updated).toMatchObject({ location: fixed, capturedLocation: phoneGps, status: 'pending' });
      await approve();
      expect(doctors.rows[0]).toMatchObject({ status: 'active', location: fixed, capturedLocation: phoneGps });
    });

    it('cannot approve or deactivate it through an edit — that is the approval’s job', async () => {
      await add();
      const update = new UpdateDoctorUseCase(doctors, assignments, territory, views, new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiologist'])), new FakeTransactions(), retirementKit(doctors, assignments, users).retirement);
      await expectStatus(update.execute('doctor-1', { status: 'active' }), 409);
      await expectStatus(update.execute('doctor-1', { status: 'inactive' }), 409);
    });
  });

  it('who can open a pending Doctor: Admin, the MR who added it, their manager — nobody else', async () => {
    await add();
    const get = new GetDoctorUseCase(doctors, visibility, views);
    for (const actor of [admin, field('mr1'), field('asm')]) expect((await get.execute(actor, 'doctor-1')).status).toBe('pending');
    await expectStatus(get.execute(field('mr2'), 'doctor-1'), 404);
    await expectStatus(get.execute(field('stranger'), 'doctor-1'), 404);
  });

  it('lists what I added in any status, newest first, with its approval', async () => {
    await add();
    await add({ clientRequestId: 'client-req-0002', name: 'Dr Two' });
    await approvals.decide(NEW_DOCTOR_KIND, 'doctor-2', 'REJECTED');
    const list = await added.list('mr1', page);
    expect(list.items.map((d) => [d.name, d.approval?.status])).toEqual([
      ['Dr Two', 'REJECTED'],
      ['Dr Mehta', 'SUBMITTED'],
    ]);
    expect((await added.list('mr2', page)).total).toBe(0);
  });
});

describe('A manager or Admin corrects a pending Doctor before approving', () => {
  it('lets the MR’s manager and Admin edit it, and nobody else', async () => {
    const assignments = new FakeAssignments();
    const doctors = new FakeDoctors(assignments);
    const territory = new FakeTerritory();
    territory.userRoutes.set('mr1', ['route-1']);
    const users = new FakeUsers();
    const views = new DoctorViews(assignments, users);
    const specialties = new SpecialtyCatalog(new FakeSpecialties(['ENT']));
    const added = new AddedDoctors(doctors, territory, new FakeApprovals(), new FakeTransactions(), views, specialties, users, new FakeConfig());
    const { doctor } = await added.add('mr1', { ...input, clientRequestId: 'client-req-0001' });
    const review = new ReviewPendingDoctorUseCase(doctors, users, new UpdateDoctorUseCase(doctors, assignments, territory, views, specialties, new FakeTransactions(), retirementKit(doctors, assignments, users).retirement));
    const fixed = { latitude: 26.8, longitude: 88.5 };

    const byManager = await review.execute(field('asm'), doctor.id, { location: fixed, clinicName: 'City Clinic', phone: '9876543210' });
    expect(byManager).toMatchObject({ location: fixed, clinicName: 'City Clinic', phone: '9876543210', capturedLocation: phoneGps });
    expect((await review.execute(admin, doctor.id, { address: '1 New Rd' })).address).toBe('1 New Rd');
    await expectStatus(review.execute(field('stranger'), doctor.id, { address: 'x' }), 404);
    await expectStatus(review.execute(field('mr1'), doctor.id, { address: 'x' }), 404);
  });
});
