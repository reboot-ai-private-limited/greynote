import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { draft, makeKit, record, removal } from './syncTestKit.js';

const mr1 = { id: 'mr1', role: 'FIELD' as const };
const mr2 = { id: 'mr2', role: 'FIELD' as const };
const T = (hh: string) => new Date(`2026-10-05T${hh}:00Z`);

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('Draft backup — the private copy of the day’s unsent records', () => {
  let kit: ReturnType<typeof makeKit>;
  beforeEach(() => {
    kit = makeKit();
  });

  describe('storing', () => {
    it('keeps a draft as-is, applies no business rule, and never touches the real records', async () => {
      const d = draft({ kind: 'ANYTHING_AT_ALL', payload: { garbage: [1, 2, { deep: true }], sampleQuantity: -5 } });
      const { results, summary } = await kit.putDrafts.execute(mr1, [d]);
      expect(results).toEqual([{ clientId: d.clientId, status: 'STORED' }]);
      expect(summary).toEqual({ stored: 1, stale: 0, submitted: 0, rejected: 0 });
      expect(kit.drafts.rows[0]).toMatchObject({ userId: 'mr1', kind: 'ANYTHING_AT_ALL', payload: { garbage: [1, 2, { deep: true }], sampleQuantity: -5 } });
      expect(kit.store).toHaveLength(0);
      expect(kit.applied).toHaveLength(0);
      expect(kit.receipts.rows).toHaveLength(0);
    });

    it('stamps each with an expiry from SYNC_DRAFT_TTL_DAYS, read live', async () => {
      const d = draft();
      await kit.putDrafts.execute(mr1, [d]);
      expect(kit.drafts.rows[0]!.expiresAt.toISOString()).toBe('2026-11-04T12:00:00.000Z'); // now + 30 days
      kit.config.values.SYNC_DRAFT_TTL_DAYS = '2';
      await kit.putDrafts.execute(mr1, [{ ...d, clientUpdatedAt: T('11:00') }]);
      expect(kit.drafts.rows[0]!.expiresAt.toISOString()).toBe('2026-10-07T12:00:00.000Z');
    });
  });

  describe('last write wins', () => {
    it('a newer copy replaces an older one; an older or equal one changes nothing', async () => {
      const d = draft({ clientUpdatedAt: T('10:00'), payload: { v: 2 } });
      await kit.putDrafts.execute(mr1, [d]);
      const older = await kit.putDrafts.execute(mr1, [{ ...d, clientUpdatedAt: T('09:00'), payload: { v: 1 } }]);
      const same = await kit.putDrafts.execute(mr1, [{ ...d, payload: { v: 'same time' } }]);
      expect(older.results[0]!.status).toBe('STALE');
      expect(same.results[0]!.status).toBe('STALE');
      expect(kit.drafts.rows[0]!.payload).toEqual({ v: 2 });
      const newer = await kit.putDrafts.execute(mr1, [{ ...d, clientUpdatedAt: T('11:00'), payload: { v: 3 } }]);
      expect(newer.results[0]!.status).toBe('STORED');
      expect(kit.drafts.rows[0]!.payload).toEqual({ v: 3 });
      expect(kit.drafts.rows).toHaveLength(1);
    });

    it('two phones uploading at once leave the newest, whichever request lands last', async () => {
      const d = draft();
      const from = (hh: string) => kit.putDrafts.execute(mr1, [{ ...d, clientUpdatedAt: T(hh), payload: { from: hh } }]);
      await Promise.all([from('10:00'), from('12:00'), from('11:00')]);
      expect(kit.drafts.rows).toHaveLength(1);
      expect(kit.drafts.rows[0]!.payload).toEqual({ from: '12:00' });
    });

    it('a removal is remembered: an older copy arriving late can’t bring the record back', async () => {
      const d = draft({ clientUpdatedAt: T('10:00') });
      await kit.putDrafts.execute(mr1, [d]);
      expect((await kit.putDrafts.execute(mr1, [removal(d.clientId, '2026-10-05T11:00:00Z')])).results[0]!.status).toBe('STORED');
      expect((await kit.putDrafts.execute(mr1, [{ ...d, clientUpdatedAt: T('10:30') }])).results[0]!.status).toBe('STALE');
      expect((await kit.listDrafts.execute(mr1, { after: null, limit: 100 })).drafts).toEqual([]);
      // …but a genuinely newer edit (the MR re-made it) does
      expect((await kit.putDrafts.execute(mr1, [{ ...d, clientUpdatedAt: T('12:00') }])).results[0]!.status).toBe('STORED');
      expect((await kit.listDrafts.execute(mr1, { after: null, limit: 100 })).drafts).toHaveLength(1);
    });

    it('removing a draft the server never had is stored too, so a stale copy that shows up later is ignored', async () => {
      const id = draft().clientId;
      await kit.putDrafts.execute(mr1, [removal(id, '2026-10-05T11:00:00Z')]);
      expect((await kit.putDrafts.execute(mr1, [{ ...draft({ clientId: id }), clientUpdatedAt: T('10:00') }])).results[0]!.status).toBe('STALE');
    });

    it('a phone clock in the future is refused — it would win last-write-wins forever', async () => {
      const future = draft({ clientUpdatedAt: new Date(kit.clock.current.getTime() + 60 * 60_000) });
      const { results } = await kit.putDrafts.execute(mr1, [future]);
      expect(results[0]).toMatchObject({ status: 'REJECTED', reason: { code: 'CLIENT_TIME_INVALID' } });
      expect(kit.drafts.rows).toHaveLength(0);
    });
  });

  describe('a record that already reached the server', () => {
    it('a late draft for it is SUBMITTED, not stored — its draft is moot', async () => {
      const r = record();
      await kit.push.execute(mr1, [r]);
      const { results } = await kit.putDrafts.execute(mr1, [draft({ clientId: r.clientId })]);
      expect(results[0]).toEqual({ clientId: r.clientId, status: 'SUBMITTED' });
      expect(kit.drafts.rows).toHaveLength(0);
    });

    it('Submit clears the record’s draft in the same transaction as its receipt', async () => {
      const r = record();
      await kit.putDrafts.execute(mr1, [draft({ clientId: r.clientId }), draft()]);
      expect(kit.drafts.rows).toHaveLength(2);
      await kit.push.execute(mr1, [r]);
      expect(kit.drafts.rows.map((d) => d.clientId)).not.toContain(r.clientId);
      expect(kit.drafts.rows).toHaveLength(1); // the other draft is untouched
    });

    it('a record that did NOT commit keeps its draft — the MR can still restore and fix it', async () => {
      const refused = record({ payload: { refuse: 'no' } });
      const crashed = record({ payload: { failAfterWrite: true } });
      await kit.putDrafts.execute(mr1, [draft({ clientId: refused.clientId }), draft({ clientId: crashed.clientId })]);
      await kit.push.execute(mr1, [refused, crashed]);
      expect(kit.drafts.rows.map((d) => d.clientId).sort()).toEqual([refused.clientId, crashed.clientId].sort());
    });

    it('a draft that raced a Submit and slipped in afterwards doesn’t come back on restore', async () => {
      const r = record();
      await kit.push.execute(mr1, [r]);
      kit.drafts.rows.push({ userId: 'mr1', clientId: r.clientId, kind: 'CALL', clientUpdatedAt: T('10:00'), payload: {}, deleted: false, id: '9'.padStart(24, '0'), expiresAt: new Date('2027-01-01') });
      expect((await kit.listDrafts.execute(mr1, { after: null, limit: 100 })).drafts).toEqual([]);
    });
  });

  describe('limits', () => {
    it('a draft over SYNC_MAX_DRAFT_BYTES is REJECTED and the rest of the batch still stores', async () => {
      kit.config.values.SYNC_MAX_DRAFT_BYTES = '100';
      const big = draft({ payload: { blob: 'x'.repeat(200) } });
      const small = draft({ payload: { a: 1 } });
      const { results } = await kit.putDrafts.execute(mr1, [big, small]);
      expect(results.map((r) => r.status)).toEqual(['REJECTED', 'STORED']);
      expect(results[0]!.reason!.code).toBe('DRAFT_TOO_LARGE');
      // The limit is bytes, not characters: multi-byte text counts for what it weighs.
      kit.config.values.SYNC_MAX_DRAFT_BYTES = '10';
      expect((await kit.putDrafts.execute(mr1, [draft({ payload: 'रोगी' })])).results[0]!.status).toBe('REJECTED');
    });

    it('SYNC_MAX_DRAFTS caps new drafts, but editing one already held never needs a slot, and removals are free', async () => {
      kit.config.values.SYNC_MAX_DRAFTS = '2';
      const [a, b, c] = [draft(), draft(), draft()];
      const first = await kit.putDrafts.execute(mr1, [a, b, c]);
      expect(first.results.map((r) => r.status)).toEqual(['STORED', 'STORED', 'REJECTED']);
      expect(first.results[2]!.reason!.code).toBe('DRAFT_LIMIT_REACHED');
      expect((await kit.putDrafts.execute(mr1, [{ ...a, clientUpdatedAt: T('11:00') }])).results[0]!.status).toBe('STORED');
      await kit.putDrafts.execute(mr1, [removal(a.clientId, '2026-10-05T11:30:00Z')]);
      expect((await kit.putDrafts.execute(mr1, [c])).results[0]!.status).toBe('STORED'); // a freed slot
    });

    it('the limit is per user, and a batch over SYNC_MAX_BATCH or reusing an id is a 400', async () => {
      kit.config.values.SYNC_MAX_DRAFTS = '1';
      await kit.putDrafts.execute(mr1, [draft()]);
      expect((await kit.putDrafts.execute(mr2, [draft()])).results[0]!.status).toBe('STORED');
      kit.config.values.SYNC_MAX_BATCH = '2';
      await expectStatus(kit.putDrafts.execute(mr1, [draft(), draft(), draft()]), 400);
      const d = draft();
      await expectStatus(kit.putDrafts.execute(mr1, [d, { ...d }]), 400);
    });
  });

  describe('private to the owner', () => {
    it('two MRs can hold drafts under the same client id, and each restores only their own', async () => {
      const d = draft({ payload: { mine: 'mr1' } });
      await kit.putDrafts.execute(mr1, [d]);
      await kit.putDrafts.execute(mr2, [{ ...d, payload: { mine: 'mr2' } }]);
      expect((await kit.listDrafts.execute(mr1, { after: null, limit: 100 })).drafts.map((x) => x.payload)).toEqual([{ mine: 'mr1' }]);
      expect((await kit.listDrafts.execute(mr2, { after: null, limit: 100 })).drafts.map((x) => x.payload)).toEqual([{ mine: 'mr2' }]);
    });

    it('only an active FIELD employee can back up or restore', async () => {
      await expectStatus(kit.putDrafts.execute({ id: 'admin', role: 'ADMIN' }, [draft()]), 403);
      await expectStatus(kit.putDrafts.execute({ id: 'gone', role: 'FIELD' }, [draft()]), 403);
      await expectStatus(kit.listDrafts.execute({ id: 'admin', role: 'ADMIN' }, { after: null, limit: 10 }), 403);
    });
  });

  describe('restoring on a new phone', () => {
    it('returns the live drafts with what the phone needs to rebuild them, paged by cursor', async () => {
      const ds = Array.from({ length: 5 }, (_, i) => draft({ payload: { n: i } }));
      await kit.putDrafts.execute(mr1, ds);
      await kit.putDrafts.execute(mr1, [removal(ds[1]!.clientId, '2026-10-05T11:00:00Z')]);
      const p1 = await kit.listDrafts.execute(mr1, { after: null, limit: 2 });
      expect(p1.drafts.map((d) => (d.payload as { n: number }).n)).toEqual([0, 2]);
      expect(p1.drafts[0]).toEqual({ clientId: ds[0]!.clientId, kind: 'CALL', clientUpdatedAt: '2026-10-05T10:00:00.000Z', payload: { n: 0 } });
      expect(p1.nextCursor).not.toBeNull();
      const p2 = await kit.listDrafts.execute(mr1, { after: p1.nextCursor, limit: 2 });
      expect(p2.drafts.map((d) => (d.payload as { n: number }).n)).toEqual([3, 4]);
      expect(p2.nextCursor).toBeNull();
    });

    it('an empty day restores as an empty list', async () => {
      expect(await kit.listDrafts.execute(mr1, { after: null, limit: 10 })).toEqual({ drafts: [], nextCursor: null });
    });
  });
});
