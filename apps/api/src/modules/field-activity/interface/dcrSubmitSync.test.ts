import { beforeEach, describe, expect, it } from 'vitest';
import { SyncRejection } from '@/modules/sync/sync.public.js';
import { makeDcrSubmitSyncHandler, DCR_SUBMIT_SYNC_KIND } from '../application/dcrSubmitSync.js';
import { faKit } from '../application/usecases/faTestKit.js';
import { dcrSubmitPayloadSchema } from './field-activity.schemas.js';

const DAY = '2026-10-05';

describe('DCR_SUBMIT through the sync push', () => {
  let kit: ReturnType<typeof faKit>;
  let handler: ReturnType<typeof makeDcrSubmitSyncHandler>;
  const run = (payload: unknown, mr = 'mr1', at = new Date('2026-10-05T12:00:00Z')) => handler.apply({ userId: mr, clientId: 'c1', clientCreatedAt: at, payload }, {});
  const refusal = async (payload: unknown, mr = 'mr1') => {
    const err = await run(payload, mr).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SyncRejection);
    return err as SyncRejection;
  };

  beforeEach(() => {
    kit = faKit('2026-10-05T13:00:00Z');
    kit.planning.approve('mr1', DAY);
    handler = makeDcrSubmitSyncHandler(kit.submit, (p) => dcrSubmitPayloadSchema.parse(p));
  });

  it('is the DCR_SUBMIT kind', () => {
    expect(handler.kind).toBe(DCR_SUBMIT_SYNC_KIND);
    expect(DCR_SUBMIT_SYNC_KIND).toBe('DCR_SUBMIT');
  });

  it('submits the day and answers with the DCR’s id as the server id', async () => {
    const { serverId } = await run({ reportDate: DAY });
    expect(kit.dcrs.rows.find((d) => d.id === serverId)).toMatchObject({ userId: 'mr1', reportDate: DAY });
    expect(kit.approvals.requests.get(`DCR:${serverId}`)).toMatchObject({ status: 'SUBMITTED', submitterId: 'mr1' });
  });

  it('a payload that isn’t a report date → INVALID_PAYLOAD naming the field, with no parser internals', async () => {
    for (const bad of [null, 'x', {}, { reportDate: 'yesterday' }, { reportDate: '2026-13-40' }]) {
      const r = await refusal(bad);
      expect(r.code).toBe('INVALID_PAYLOAD');
      expect(r.message).not.toMatch(/ZodError|invalid_type/i);
    }
    expect((await refusal({ reportDate: 'x' })).message).toMatch(/^reportDate:/);
  });

  it('a gate refusal becomes the record’s reason with the gate’s own code', async () => {
    expect((await refusal({ reportDate: DAY }, 'stranger')).code).toBe('DAILY_PLAN_NOT_APPROVED');
    kit.users.users.get('mr1')!.blocked = true;
    expect((await refusal({ reportDate: DAY })).code).toBe('USER_BLOCKED');
    kit.users.users.get('mr1')!.blocked = false;
    expect((await refusal({ reportDate: '2026-10-08' })).code).toBe('DATE_IN_FUTURE');
  });

  it('submitting the same day again is DCR_LOCKED', async () => {
    await run({ reportDate: DAY });
    expect((await refusal({ reportDate: DAY })).code).toBe('DCR_LOCKED');
  });
});
