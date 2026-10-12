import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DeleteDcrRecordUseCase } from './deleteDcrRecord.usecase.js';
import { faKit, Tx } from './faTestKit.js';

const DAY = '2026-10-05';
const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };
const CLINIC = { latitude: 26.7271, longitude: 88.3953 };
const runner = { run: async <T>(fn: (ctx: unknown) => Promise<T>) => fn(new Tx()) };

async function statusOf(p: Promise<unknown>): Promise<number> {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).statusCode;
}

describe('removing a call or follow-up before the report is submitted', () => {
  let kit: ReturnType<typeof faKit>;
  let del: DeleteDcrRecordUseCase;
  let dcrId: string, doctorCallId: string, chemistCallId: string, followupId: string;

  beforeEach(async () => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    const tx = new Tx();
    const gps = { capturedLocation: CLINIC, accuracyMeters: 5 };
    doctorCallId = (await kit.logDoctorCall.execute(REC, { reportDate: DAY, doctorId: 'd1', workWith: [], remarks: null, ...gps, samples: [{ productId: 'p1', quantity: 4 }] }, tx)).serverId;
    chemistCallId = (await kit.logChemistCall.execute({ ...REC, clientId: 'c-2' }, { reportDate: DAY, chemistId: 'c1', workWith: [], remarks: null, ...gps }, tx)).serverId;
    followupId = (await kit.logFollowup.execute({ ...REC, clientId: 'c-3' }, { reportDate: DAY, subject: 'DOCTOR', subjectId: 'd1', remarks: 'x', ...gps }, tx)).serverId;
    dcrId = kit.dcrs.rows[0]!.id;
    del = new DeleteDcrRecordUseCase(kit.dcrs, kit.approvals, kit.doctorCalls, kit.chemistCalls, kit.followups, kit.fmd, runner);
  });

  it('removes a doctor call and gives its samples back', async () => {
    expect(kit.fmd.allocations.get('d1:p1')!.quantityRemaining).toBe(6);
    await del.deleteCall('mr1', dcrId, doctorCallId);
    expect(kit.doctorCalls.rows).toHaveLength(0);
    expect(kit.fmd.allocations.get('d1:p1')!.quantityRemaining).toBe(10);
  });

  it('removes a chemist call and a follow-up', async () => {
    await del.deleteCall('mr1', dcrId, chemistCallId);
    await del.deleteFollowup('mr1', dcrId, followupId);
    expect(kit.chemistCalls.rows).toHaveLength(0);
    expect(kit.followups.rows).toHaveLength(0);
  });

  it('only the owner: anyone else sees no such report', async () => {
    expect(await statusOf(del.deleteCall('mr2', dcrId, doctorCallId))).toBe(404);
    expect(kit.doctorCalls.rows).toHaveLength(1);
  });

  it('a record that is not on this report is 404, and the call/follow-up ids are not interchangeable', async () => {
    expect(await statusOf(del.deleteCall('mr1', dcrId, 'nope'))).toBe(404);
    expect(await statusOf(del.deleteCall('mr1', dcrId, followupId))).toBe(404);
    expect(await statusOf(del.deleteFollowup('mr1', dcrId, doctorCallId))).toBe(404);
  });

  it('once the report is submitted it is 409; after it is sent back, it can be edited again', async () => {
    await kit.submit.execute('mr1', DAY, REC.recordedAt, new Tx());
    expect(await statusOf(del.deleteCall('mr1', dcrId, doctorCallId))).toBe(409);
    expect(kit.fmd.allocations.get('d1:p1')!.quantityRemaining).toBe(6);
    kit.approvals.setStatus(dcrId, 'REJECTED');
    await del.deleteCall('mr1', dcrId, doctorCallId);
    expect(kit.doctorCalls.rows).toHaveLength(0);
  });
});
