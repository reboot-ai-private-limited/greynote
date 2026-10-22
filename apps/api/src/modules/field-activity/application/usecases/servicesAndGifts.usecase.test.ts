import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { GateRefusal } from '../../domain/gateRefusal.js';
import { LogRefusal } from '../../domain/logRefusal.js';
import { faKit, Tx } from './faTestKit.js';
import { GetDoctorServiceUseCase, ListDoctorServicesUseCase, ListGiftsUseCase, MarkDoctorServiceDoneUseCase } from './servicesAndGifts.usecase.js';

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
