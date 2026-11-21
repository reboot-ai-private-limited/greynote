import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { GateRefusal } from '../../domain/gateRefusal.js';
import { LogRefusal } from '../../domain/logRefusal.js';
import { faKit, Tx } from './faTestKit.js';
import { GetDoctorServiceUseCase, ListDoctorServicesUseCase, ListGiftsUseCase, MarkDoctorServiceDoneUseCase, RequestGiftUseCase, ReviewGiftRequestUseCase } from './servicesAndGifts.usecase.js';

const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };
const svc = { doctorId: 'd1', serviceType: 'TOUR_PACKAGE' as const, amountPaise: 1_500_000, remarks: null };

async function refusal(p: Promise<unknown>) {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err instanceof GateRefusal || err instanceof LogRefusal || err instanceof AppError).toBe(true);
  return err as GateRefusal | LogRefusal | AppError;
}

describe('Doctor Services', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
  });

  it('an MR’s request is stored tied to them and submitted for approval, in the caller’s transaction', async () => {
    const { serverId } = await kit.submitService.execute(REC, svc, new Tx());
    expect(kit.services.rows[0]).toMatchObject({ id: serverId, userId: 'mr1', createdBy: 'mr1', origin: 'MR', doctorId: 'd1', amountPaise: 1_500_000, clientId: 'c-1' });
    expect(await kit.approvals.getForRecord('DOCTOR_SERVICE', serverId)).toMatchObject({ status: 'SUBMITTED', submitterId: 'mr1', cycle: 1 });
  });

  it('needs no approved Plan (it is not part of the day), but not for a blocked MR, nor a Doctor they no longer have', async () => {
    expect((await kit.submitService.execute(REC, svc, new Tx())).serverId).toBeTruthy();
    kit.users.users.get('mr1')!.blocked = true;
    expect((await refusal(kit.submitService.execute({ ...REC, clientId: 'c-2' }, svc, new Tx()))).message).toMatch(/blocked/i);
    kit.users.users.get('mr1')!.blocked = false;
    kit.fmd.assigned.clear();
    expect(((await refusal(kit.submitService.execute({ ...REC, clientId: 'c-3' }, svc, new Tx()))) as LogRefusal).code).toBe('DOCTOR_NOT_ASSIGNED');
    expect(kit.services.rows).toHaveLength(1);
  });

  it('a manager can request a service for a doctor of their team (2026-11-02), tied to the manager, and it goes up their own chain', async () => {
    const { serverId } = await kit.submitService.execute({ ...REC, userId: 'asm', clientId: 'c-asm' }, svc, new Tx());
    expect(kit.services.rows[0]).toMatchObject({ userId: 'asm', createdBy: 'asm', origin: 'MR', doctorId: 'd1' });
    expect(await kit.approvals.getForRecord('DOCTOR_SERVICE', serverId)).toMatchObject({ status: 'SUBMITTED', submitterId: 'asm' });
  });

  it('only for their own scope: not a colleague’s doctor, and not a doctor the manager has nothing to do with', async () => {
    // mr2 has no doctor of their own and is not above anyone.
    expect(((await refusal(kit.submitService.execute({ ...REC, userId: 'mr2', clientId: 'c-mr2' }, svc, new Tx()))) as LogRefusal).code).toBe('DOCTOR_NOT_ASSIGNED');
    // d1's MR is mr1, who reports to asm, not to mr2; a manager of someone else is refused too.
    kit.users.add('other-mgr', { role: 'FIELD', managerId: null });
    expect(((await refusal(kit.submitService.execute({ ...REC, userId: 'other-mgr', clientId: 'c-om' }, svc, new Tx()))) as LogRefusal).code).toBe('DOCTOR_NOT_ASSIGNED');
    expect(kit.services.rows).toHaveLength(0);
  });

  it('Admin creates one directly: effective at once, tied to the Doctor’s assigned MR, no approval request', async () => {
    const s = await kit.adminService.execute('admin', svc);
    expect(s).toMatchObject({ origin: 'ADMIN', userId: 'mr1', createdBy: 'admin', clientId: null });
    expect(await kit.approvals.getForRecord('DOCTOR_SERVICE', s.id)).toBeNull();
  });

  it('Admin’s: an unknown Doctor is 404, a Doctor with no assigned MR is 409', async () => {
    expect(((await refusal(kit.adminService.execute('admin', { ...svc, doctorId: 'nope' }))) as AppError).statusCode).toBe(404);
    kit.fmd.assignedTo.clear();
    expect(((await refusal(kit.adminService.execute('admin', svc))) as AppError).statusCode).toBe(409);
  });

  it('the list: an MR sees only their own with the request’s status; Admin sees all, an Admin-made one as APPROVED', async () => {
    await kit.submitService.execute(REC, svc, new Tx());
    await kit.adminService.execute('admin', svc);
    kit.services.rows.push({ ...kit.services.rows[0]!, id: 'other', userId: 'mr2' });
    const list = new ListDoctorServicesUseCase(kit.services, kit.approvals, kit.fmd);
    const mine = await list.execute({ id: 'mr1', role: 'FIELD' }, {});
    expect(mine.map((s) => [s.origin, s.status, s.doctorName])).toEqual([['MR', 'SUBMITTED', 'Dr Rao'], ['ADMIN', 'APPROVED', 'Dr Rao']]);
    expect((await list.execute({ id: 'admin', role: 'ADMIN' }, {})).length).toBe(3);
    expect((await list.execute({ id: 'mr1', role: 'FIELD' }, { doctorId: 'zzz' })).length).toBe(0);
    // an MR cannot widen the list by naming someone else
    expect((await list.execute({ id: 'mr1', role: 'FIELD' }, { userId: 'mr2' })).every((s) => s.userId === 'mr1')).toBe(true);
  });
});

describe('Doctor Service by id', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
  });

  it('Admin reads any; an MR-made one carries the request’s status and id, an Admin-made one is APPROVED', async () => {
    const { serverId } = await kit.submitService.execute(REC, svc, new Tx());
    const adminMade = await kit.adminService.execute('admin', svc);
    const get = new GetDoctorServiceUseCase(kit.services, kit.approvals, kit.fmd);
    const mr = await get.execute({ id: 'admin', role: 'ADMIN' }, serverId);
    expect(mr).toMatchObject({ origin: 'MR', status: 'SUBMITTED', doctorName: 'Dr Rao', userId: 'mr1', amountPaise: 1_500_000 });
    expect(mr.approval).toMatchObject({ requestId: expect.any(String), cycle: 1 });
    expect(await get.execute({ id: 'admin', role: 'ADMIN' }, adminMade.id)).toMatchObject({ origin: 'ADMIN', status: 'APPROVED', approval: null });
  });

  it('an MR reads only their own: someone else’s and an unknown id are the same 404', async () => {
    const { serverId } = await kit.submitService.execute(REC, svc, new Tx());
    const get = new GetDoctorServiceUseCase(kit.services, kit.approvals, kit.fmd);
    expect((await get.execute({ id: 'mr1', role: 'FIELD' }, serverId)).id).toBe(serverId);
    expect(((await refusal(get.execute({ id: 'mr2', role: 'FIELD' }, serverId))) as AppError).statusCode).toBe(404);
    expect(((await refusal(get.execute({ id: 'admin', role: 'ADMIN' }, 'nope'))) as AppError).statusCode).toBe(404);
  });
});

describe('Doctor Service done', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
  });

  it('only once approved; then done once, by Admin or Accounts; Accounts can read the list', async () => {
    const done = new MarkDoctorServiceDoneUseCase(kit.services, kit.approvals, kit.fmd, () => new Date('2026-10-12T05:00:00Z'));
    const { serverId } = await kit.submitService.execute(REC, svc, new Tx());
    expect(((await refusal(done.execute('acc', serverId))) as AppError).statusCode).toBe(409); // still SUBMITTED
    kit.approvals.requests.get(`DOCTOR_SERVICE:${serverId}`)!.status = 'APPROVED';
    const list = new ListDoctorServicesUseCase(kit.services, kit.approvals, kit.fmd);
    expect((await list.execute({ id: 'acc', role: 'ACCOUNTANT' }, {}))[0]).toMatchObject({ awaitingDone: true });
    expect(await done.execute('acc', serverId)).toMatchObject({ doneBy: 'acc', awaitingDone: false });
    expect(((await refusal(done.execute('admin', serverId))) as AppError).statusCode).toBe(409); // already done
    expect(((await refusal(done.execute('admin', 'nope'))) as AppError).statusCode).toBe(404);
  });

  it('an Admin-made service is approved already and waits only for Done', async () => {
    const s = await kit.adminService.execute('admin', svc);
    const done = new MarkDoctorServiceDoneUseCase(kit.services, kit.approvals, kit.fmd);
    expect((await done.execute('admin', s.id)).doneAt).toBeInstanceOf(Date);
  });
});

describe('Doctor Gifts', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
  });
  const gift = () => kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Table lamp', amountPaise: 80_000 });

  it('Admin allocates: PENDING, no MR named, no approval', async () => {
    expect(await gift()).toMatchObject({ status: 'PENDING', doctorId: 'd1', allocatedBy: 'admin', completedBy: null });
  });

  it('refuses a gift for an unknown doctor, and for an inactive or deleted one (history only)', async () => {
    kit.fmd.doctors.set('d1', { id: 'd1', name: 'Dr Rao', status: 'inactive', routeId: 'route-1' });
    await expect(gift()).rejects.toMatchObject({ statusCode: 409 });
    await expect(kit.allocateGift.execute('admin', { doctorId: 'nope', productName: 'Lamp', amountPaise: 100 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('the assigned MR marks it DONE with who and when; a second time, even by the same MR, is GIFT_ALREADY_DONE', async () => {
    const g = await gift();
    const tx = new Tx();
    expect(await kit.markGiftDone.execute(REC, g.id, tx)).toEqual({ serverId: g.id });
    expect(kit.gifts.rows[0]).toMatchObject({ status: 'DONE', completedBy: 'mr1', completedAt: REC.recordedAt });
    expect(((await refusal(kit.markGiftDone.execute({ ...REC, clientId: 'c-2' }, g.id, new Tx()))) as LogRefusal).code).toBe('GIFT_ALREADY_DONE');
  });

  it('refuses a gift that does not exist, a Doctor the MR no longer has, and a blocked MR', async () => {
    const g = await gift();
    expect(((await refusal(kit.markGiftDone.execute(REC, 'nope', new Tx()))) as LogRefusal).code).toBe('GIFT_NOT_FOUND');
    expect(((await refusal(kit.markGiftDone.execute({ ...REC, userId: 'mr2' }, g.id, new Tx()))) as LogRefusal).code).toBe('DOCTOR_NOT_ASSIGNED');
    kit.users.users.get('mr1')!.blocked = true;
    expect(((await refusal(kit.markGiftDone.execute(REC, g.id, new Tx()))) as GateRefusal).code).toBe('USER_BLOCKED');
    expect(kit.gifts.rows[0]!.status).toBe('PENDING');
  });

  it('an unknown Doctor cannot be allocated a gift (404)', async () => {
    expect(((await refusal(kit.allocateGift.execute('admin', { doctorId: 'nope', productName: 'x', amountPaise: 0 }))) as AppError).statusCode).toBe(404);
  });

  it('the list: an MR sees the gifts of the Doctors they have; Admin sees all, filterable by status', async () => {
    await gift();
    kit.gifts.rows.push({ ...kit.gifts.rows[0]!, id: 'g-other', doctorId: 'd9' });
    const list = new ListGiftsUseCase(kit.gifts, kit.fmd);
    expect((await list.execute({ id: 'mr1', role: 'FIELD' }, {})).map((g) => g.id)).toEqual(['gift-1']);
    expect((await list.execute({ id: 'mr2', role: 'FIELD' }, {})).length).toBe(0);
    expect((await list.execute({ id: 'admin', role: 'ADMIN' }, {})).length).toBe(2);
    expect((await list.execute({ id: 'admin', role: 'ADMIN' }, { status: 'DONE' })).length).toBe(0);
  });
});

describe('a manager reads the team’s gifts and services (2026-11-18)', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
  });

  it('gifts: scope team adds the gifts of doctors held below the manager, each with the MR; without it only their own; an MR is unchanged', async () => {
    await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Table lamp', amountPaise: 80_000 });
    const list = new ListGiftsUseCase(kit.gifts, kit.fmd, kit.users);
    const team = await list.execute({ id: 'asm', role: 'FIELD' }, { scope: 'team' });
    expect(team.map((g) => [g.id, g.userId])).toEqual([['gift-1', 'mr1']]);
    expect(team[0]?.userName).toBeTruthy();
    expect(await list.execute({ id: 'asm', role: 'FIELD' }, {})).toHaveLength(0);
    expect(await list.execute({ id: 'mr1', role: 'FIELD' }, { scope: 'team' })).toHaveLength(1);
    expect(await list.execute({ id: 'mr2', role: 'FIELD' }, { scope: 'team' })).toHaveLength(0);
  });

  it('gifts: done ones are listed too, and can be filtered', async () => {
    const g = await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Lamp', amountPaise: 100 });
    await kit.markGiftDone.execute(REC, g.id, new Tx());
    const list = new ListGiftsUseCase(kit.gifts, kit.fmd, kit.users);
    expect((await list.execute({ id: 'mr1', role: 'FIELD' }, {})).map((x) => x.status)).toEqual(['DONE']);
    expect(await list.execute({ id: 'mr1', role: 'FIELD' }, { status: 'PENDING' })).toHaveLength(0);
  });

  it('services: scope team adds the requests of everyone below, named; an MR or no scope sees only their own', async () => {
    await kit.submitService.execute(REC, svc, new Tx());
    kit.services.rows.push({ ...kit.services.rows[0]!, id: 'elsewhere', userId: 'someone-else' });
    const list = new ListDoctorServicesUseCase(kit.services, kit.approvals, kit.fmd, kit.users);
    const team = await list.execute({ id: 'asm', role: 'FIELD' }, { scope: 'team' });
    expect(team.map((s) => s.userId)).toEqual(['mr1']);
    expect(team[0]?.userName).toBeTruthy();
    expect(await list.execute({ id: 'asm', role: 'FIELD' }, {})).toHaveLength(0);
    expect((await list.execute({ id: 'mr1', role: 'FIELD' }, { scope: 'team' })).map((s) => s.userId)).toEqual(['mr1']);
  });
});

describe('a manager reads a team service (2026-11-18)', () => {
  it('the manager above the MR reads it, named; an unrelated manager and another MR get the 404 of a missing id', async () => {
    const kit = faKit();
    const { serverId } = await kit.submitService.execute(REC, svc, new Tx());
    const get = new GetDoctorServiceUseCase(kit.services, kit.approvals, kit.fmd, kit.users);
    const seen = await get.execute({ id: 'asm', role: 'FIELD' }, serverId);
    expect(seen).toMatchObject({ id: serverId, userId: 'mr1', status: 'SUBMITTED' });
    expect(seen.userName).toBeTruthy();
    expect(await get.execute({ id: 'mr1', role: 'FIELD' }, serverId)).toMatchObject({ id: serverId });
    kit.users.add('other-mgr', { role: 'FIELD', managerId: null });
    await expect(get.execute({ id: 'other-mgr', role: 'FIELD' }, serverId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(get.execute({ id: 'mr2', role: 'FIELD' }, serverId)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('gift requests (2026-11)', () => {
  let kit: ReturnType<typeof faKit>;
  let request: RequestGiftUseCase;
  let review: ReviewGiftRequestUseCase;
  beforeEach(() => {
    kit = faKit();
    request = new RequestGiftUseCase(kit.fmd, kit.gifts);
    review = new ReviewGiftRequestUseCase(kit.gifts);
  });

  it('an employee asks for a gift for their own doctor: REQUESTED, no amount, from the employee', async () => {
    const g = await request.execute('mr1', { doctorId: 'd1', productName: 'Desk clock', note: 'Birthday' });
    expect(g).toMatchObject({ status: 'REQUESTED', origin: 'EMPLOYEE', requestedBy: 'mr1', amountPaise: 0, requestNote: 'Birthday' });
  });

  it('not for a doctor that is not theirs, or one that does not exist', async () => {
    expect((await refusal(request.execute('mr2', { doctorId: 'd1', productName: 'x', note: null }))).message).toMatch(/not yours/);
    expect(((await refusal(request.execute('mr1', { doctorId: 'nope', productName: 'x', note: null }))) as AppError).statusCode).toBe(404);
  });

  it('Admin or Accounts accept it with an amount and it becomes a normal pending gift the MR can mark done; nobody else can answer', async () => {
    const g = await request.execute('mr1', { doctorId: 'd1', productName: 'Desk clock', note: null });
    expect(((await refusal(review.accept({ id: 'asm', role: 'FIELD' }, g.id, 50_000))) as AppError).statusCode).toBe(403);
    await review.accept({ id: 'acc1', role: 'ACCOUNTANT' }, g.id, 50_000);
    expect(kit.gifts.rows[0]).toMatchObject({ status: 'PENDING', amountPaise: 50_000, allocatedBy: 'acc1', origin: 'EMPLOYEE', requestedBy: 'mr1' });
    expect((await kit.markGiftDone.execute(REC, g.id, new Tx())).serverId).toBe(g.id);
    expect(kit.gifts.rows[0]!.status).toBe('DONE');
  });

  it('a rejected request keeps the reason, never becomes pending, and cannot be answered twice or marked done', async () => {
    const g = await request.execute('mr1', { doctorId: 'd1', productName: 'Desk clock', note: null });
    await review.reject({ id: 'admin', role: 'ADMIN' }, g.id, 'Over budget');
    expect(kit.gifts.rows[0]).toMatchObject({ status: 'REJECTED', rejectReason: 'Over budget' });
    expect(((await refusal(review.accept({ id: 'admin', role: 'ADMIN' }, g.id, 100))) as AppError).statusCode).toBe(409);
    expect(((await refusal(kit.markGiftDone.execute(REC, g.id, new Tx()))) as LogRefusal).code).toBe('GIFT_ALREADY_DONE');
  });

  it('an Admin allocation is not a request: it cannot be accepted or rejected', async () => {
    const g = await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Lamp', amountPaise: 100 });
    expect(((await refusal(review.reject({ id: 'admin', role: 'ADMIN' }, g.id, 'x'))) as AppError).statusCode).toBe(404);
  });

  it('the list shows both kinds to the employee, their manager and Admin; "not given yet" is requested plus pending', async () => {
    await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Lamp', amountPaise: 100 });
    const asked = await request.execute('mr1', { doctorId: 'd1', productName: 'Clock', note: null });
    const rejected = await request.execute('mr1', { doctorId: 'd1', productName: 'Pen set', note: null });
    await review.reject({ id: 'admin', role: 'ADMIN' }, rejected.id, 'No');
    const done = await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Bag', amountPaise: 100 });
    await kit.markGiftDone.execute(REC, done.id, new Tx());
    const list = new ListGiftsUseCase(kit.gifts, kit.fmd, kit.users);
    expect(await list.execute({ id: 'mr1', role: 'FIELD' }, {})).toHaveLength(4);
    expect((await list.execute({ id: 'asm', role: 'FIELD' }, { scope: 'team' })).map((g) => g.id)).toContain(asked.id);
    expect((await list.execute({ id: 'acc1', role: 'ACCOUNTANT' }, { notGiven: true })).map((g) => g.productName).sort()).toEqual(['Clock', 'Lamp']);
    expect((await list.execute({ id: 'admin', role: 'ADMIN' }, { status: 'REQUESTED' })).map((g) => g.id)).toEqual([asked.id]);
  });
});
