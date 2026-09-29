import { beforeEach, describe, expect, it } from 'vitest';
import { DOCTOR_SERVICE_TYPES, SYNC_RECORD_KINDS, type DoctorServicePayload, type GiftDonePayload } from '@greynote/contracts';
import type { SyncRejection } from '@/modules/sync/sync.public.js';
import { DOCTOR_SERVICE_SYNC_KIND, GIFT_DONE_SYNC_KIND, makeServiceGiftSyncHandlers } from '../application/serviceGiftSync.js';
import { faKit, Tx } from '../application/usecases/faTestKit.js';
import { DOCTOR_SERVICE_TYPES as SERVER_TYPES } from '../domain/serviceGift.entity.js';
import { doctorServicePayloadSchema, giftDonePayloadSchema } from './field-activity.schemas.js';

const oid = (c: string) => c.repeat(24);

describe('the Doctor Service and gift-done records', () => {
  let kit: ReturnType<typeof faKit>;
  let handlers: ReturnType<typeof makeServiceGiftSyncHandlers>;
  const run = (kind: string, payload: unknown, tx = new Tx()) => handlers.find((h) => h.kind === kind)!.apply({ userId: 'mr1', clientId: 'c-1', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload }, tx);
  const code = async (p: Promise<unknown>) => ((await p.then(() => undefined, (e: unknown) => e)) as SyncRejection).code;

  beforeEach(() => {
    kit = faKit();
    handlers = makeServiceGiftSyncHandlers({ service: kit.submitService, gift: kit.markGiftDone, parse: { service: (p) => doctorServicePayloadSchema.parse(p), giftDone: (p) => giftDonePayloadSchema.parse(p) } });
  });

  it('are the contract’s kinds and types', () => {
    expect(SYNC_RECORD_KINDS).toEqual(expect.arrayContaining([DOCTOR_SERVICE_SYNC_KIND, GIFT_DONE_SYNC_KIND]));
    expect([...SERVER_TYPES]).toEqual([...DOCTOR_SERVICE_TYPES]);
  });

  it('accept the contract’s payloads; a Service is submitted, a gift done', async () => {
    const service: DoctorServicePayload = { doctorId: 'd1', serviceType: 'ONLINE_PROMOTION', amountPaise: 250_000 };
    expect(doctorServicePayloadSchema.parse({ ...service, doctorId: oid('a') }).remarks).toBeNull();
    const lenient = makeServiceGiftSyncHandlers({ service: kit.submitService, gift: kit.markGiftDone, parse: { service: (p) => p as never, giftDone: (p) => p as never } });
    const out = await lenient.find((h) => h.kind === 'DOCTOR_SERVICE')!.apply({ userId: 'mr1', clientId: 'c-1', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload: service }, new Tx());
    expect(out.serverId).toBeTruthy();
    const g = await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Pen set', amountPaise: 0 });
    const done: GiftDonePayload = { giftId: g.id };
    expect(await lenient.find((h) => h.kind === 'GIFT_DONE')!.apply({ userId: 'mr1', clientId: 'c-2', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload: done }, new Tx())).toEqual({ serverId: g.id });
  });

  it('refuse bad payloads as INVALID_PAYLOAD: an unknown type, a decimal, zero, a missing gift id', async () => {
    for (const bad of [
      { doctorId: oid('a'), serviceType: 'HOLIDAY', amountPaise: 100 },
      { doctorId: oid('a'), serviceType: 'GIFT', amountPaise: 10.5 },
      { doctorId: oid('a'), serviceType: 'GIFT', amountPaise: 0 },
      { doctorId: 'x', serviceType: 'GIFT', amountPaise: 100 },
    ]) expect(await code(run('DOCTOR_SERVICE', bad))).toBe('INVALID_PAYLOAD');
    expect(await code(run('GIFT_DONE', {}))).toBe('INVALID_PAYLOAD');
  });

  it('carry a lookup or gate refusal to the phone with its own code', async () => {
    const lenient = makeServiceGiftSyncHandlers({ service: kit.submitService, gift: kit.markGiftDone, parse: { service: (p) => p as never, giftDone: (p) => p as never } });
    const rec = { userId: 'mr1', clientId: 'c', clientCreatedAt: new Date(), payload: { giftId: 'nope' } };
    expect(await code(lenient.find((h) => h.kind === 'GIFT_DONE')!.apply(rec, new Tx()))).toBe('GIFT_NOT_FOUND');
    kit.users.users.get('mr1')!.blocked = true;
    expect(await code(lenient.find((h) => h.kind === 'DOCTOR_SERVICE')!.apply({ ...rec, payload: { doctorId: 'd1', serviceType: 'GIFT', amountPaise: 100 } }, new Tx()))).toBe('USER_BLOCKED');
  });
});
