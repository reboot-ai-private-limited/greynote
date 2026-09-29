import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { SyncRejection } from '../../domain/syncHandler.js';
import { makeKit, record, uuid } from './syncTestKit.js';

const mr1 = { id: 'mr1', role: 'FIELD' as const };

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('Push — the daily report’s Submit', () => {
  let kit: ReturnType<typeof makeKit>;
  beforeEach(() => {
    kit = makeKit();
  });

  describe('applying records', () => {
    it('applies each once, answers per record in the order sent, and writes a receipt for each', async () => {
      const a = record({ payload: { name: 'A' } });
      const b = record({ payload: { name: 'B' } });
      const { results, summary } = await kit.push.execute(mr1, [a, b]);
      expect(results).toEqual([
        { clientId: a.clientId, status: 'SYNCED', serverId: 'call-1' },
        { clientId: b.clientId, status: 'SYNCED', serverId: 'call-2' },
      ]);
      expect(summary).toEqual({ synced: 2, alreadySynced: 0, failed: 0 });
      expect(kit.receipts.rows.map((r) => [r.clientId, r.serverId, r.kind, r.userId])).toEqual([
        [a.clientId, 'call-1', 'CALL', 'mr1'],
        [b.clientId, 'call-2', 'CALL', 'mr1'],
      ]);
    });

    it('applies parents before children whatever order they were sent in', async () => {
      const day = record();
      const call = record({ dependsOn: [day.clientId] });
      const followup = record({ dependsOn: [call.clientId] });
      const { results } = await kit.push.execute(mr1, [followup, call, day]);
      expect(kit.applied).toEqual([day.clientId, call.clientId, followup.clientId]);
      expect(results.map((r) => r.clientId)).toEqual([followup.clientId, call.clientId, day.clientId]); // answered in the request's order
      expect(results.every((r) => r.status === 'SYNCED')).toBe(true);
    });
  });

  describe('idempotent on the client id', () => {
    it('sending it again is ALREADY_SYNCED with the original serverId, and nothing runs twice', async () => {
      const a = record();
      await kit.push.execute(mr1, [a]);
      const again = await kit.push.execute(mr1, [a]);
      expect(again.results).toEqual([{ clientId: a.clientId, status: 'ALREADY_SYNCED', serverId: 'call-1' }]);
      expect(kit.applied).toEqual([a.clientId]);
      expect(kit.store).toHaveLength(1);
      expect(kit.receipts.rows).toHaveLength(1);
    });

    it('a retried Submit of the whole day: what synced is recognised, only what is left is applied', async () => {
      const ok = record();
      const bad = record({ payload: { refuse: 'No samples left' } });
      await kit.push.execute(mr1, [ok, bad]);
      const fixed = { ...bad, payload: { name: 'reduced quantity' } };
      const retry = await kit.push.execute(mr1, [ok, fixed]);
      expect(retry.results.map((r) => r.status)).toEqual(['ALREADY_SYNCED', 'SYNCED']);
      expect(kit.store.map((r) => r.name)).toEqual(['call', 'reduced quantity']);
    });

    it('a record refused because a simultaneous send won the race is ALREADY_SYNCED, not FAILED — it is delivered', async () => {
      // The other request commits this record's receipt while this one is failing (here: on a refusal it never
      // would have made on its own), so the failure is moot.
      kit.registry.register({
        kind: 'RACER',
        async apply({ userId, clientId }) {
          kit.receipts.rows.push({ userId, clientId, kind: 'RACER', serverId: 'winner-1', syncedAt: new Date() });
          throw new SyncRejection('ADDED_AT_THE_SAME_TIME', 'Tap Submit again.');
        },
      });
      const r = record({ kind: 'RACER' });
      const { results, summary } = await kit.push.execute(mr1, [r]);
      expect(results).toEqual([{ clientId: r.clientId, status: 'ALREADY_SYNCED', serverId: 'winner-1' }]);
      expect(summary).toEqual({ synced: 0, alreadySynced: 1, failed: 0 });
    });

    it('a genuine failure with no receipt behind it is still FAILED', async () => {
      const { results } = await kit.push.execute(mr1, [record({ payload: { refuse: 'no' } })]);
      expect(results[0]!.status).toBe('FAILED');
    });

    it('two MRs can use the same client id without colliding — a receipt is per user', async () => {
      const a = record();
      expect((await kit.push.execute(mr1, [a])).results[0]!.status).toBe('SYNCED');
      expect((await kit.push.execute({ id: 'mr2', role: 'FIELD' }, [a])).results[0]!.status).toBe('SYNCED');
      expect(kit.store).toHaveLength(2);
    });

    it('the same record sent twice at once is applied exactly once — the loser is ALREADY_SYNCED', async () => {
      const a = record();
      // Both requests look before either writes, as two real requests do.
      const [x, y] = await Promise.all([kit.push.execute(mr1, [a]), kit.push.execute(mr1, [a])]);
      expect([x.results[0]!.status, y.results[0]!.status].sort()).toEqual(['ALREADY_SYNCED', 'SYNCED']);
      expect(x.results[0]!.serverId).toBe(y.results[0]!.serverId);
      expect(kit.store).toHaveLength(1); // the loser's write was rolled back
      expect(kit.receipts.rows).toHaveLength(1);
    });
  });

  describe('a failure is per record, never per batch', () => {
    it('a refusal becomes that record’s reason and the rest carry on; nothing of it is kept', async () => {
      const a = record();
      const refused = record({ payload: { refuse: 'Only 2 samples left' } });
      const c = record();
      const { results, summary } = await kit.push.execute(mr1, [a, refused, c]);
      expect(results.map((r) => r.status)).toEqual(['SYNCED', 'FAILED', 'SYNCED']);
      expect(results[1]!.reason).toEqual({ code: 'SAMPLES_EXHAUSTED', message: 'Only 2 samples left' });
      expect(summary).toEqual({ synced: 2, alreadySynced: 0, failed: 1 });
      expect(kit.receipts.rows.map((r) => r.clientId)).toEqual([a.clientId, c.clientId]); // no receipt for the failed one
    });

    it('a handler’s AppError with a 4xx is a refusal with its own code and message', async () => {
      kit.registry.register({
        kind: 'STRICT',
        async apply() {
          throw AppError.conflict('This Doctor was reassigned.');
        },
      });
      const { results } = await kit.push.execute(mr1, [record({ kind: 'STRICT' })]);
      expect(results[0]).toMatchObject({ status: 'FAILED', reason: { code: 'CONFLICT', message: 'This Doctor was reassigned.' } });
    });

    it('a crash is INTERNAL and retryable, and none of its detail reaches the phone', async () => {
      const { results } = await kit.push.execute(mr1, [record({ payload: { crash: true } }), record()]);
      expect(results[0]!.status).toBe('FAILED');
      expect(results[0]!.reason!.code).toBe('INTERNAL');
      expect(JSON.stringify(results[0])).not.toContain('mongodb://');
      expect(results[1]!.status).toBe('SYNCED');
    });

    it('a record that fails after writing leaves nothing behind — write and receipt roll back together', async () => {
      const { results } = await kit.push.execute(mr1, [record({ payload: { failAfterWrite: true } })]);
      expect(results[0]!.status).toBe('FAILED');
      expect(kit.store).toHaveLength(0);
      expect(kit.receipts.rows).toHaveLength(0);
    });

    it('a failed record can be sent again once fixed, and is applied fresh', async () => {
      const a = record({ payload: { refuse: 'no' } });
      await kit.push.execute(mr1, [a]);
      expect((await kit.push.execute(mr1, [{ ...a, payload: {} }])).results[0]!.status).toBe('SYNCED');
    });

    it('an unknown kind is reported, not a fault', async () => {
      const { results } = await kit.push.execute(mr1, [record({ kind: 'TELEPORT' })]);
      expect(results[0]).toMatchObject({ status: 'FAILED', reason: { code: 'UNKNOWN_KIND' } });
    });
  });

  describe('dependencies', () => {
    it('a child of a failed parent is DEPENDENCY_FAILED and not applied — and so is its child', async () => {
      const day = record({ payload: { refuse: 'closed' } });
      const call = record({ dependsOn: [day.clientId] });
      const followup = record({ dependsOn: [call.clientId] });
      const independent = record();
      const { results } = await kit.push.execute(mr1, [day, call, followup, independent]);
      expect(results.map((r) => r.status)).toEqual(['FAILED', 'FAILED', 'FAILED', 'SYNCED']);
      expect(results[1]!.reason!.code).toBe('DEPENDENCY_FAILED');
      expect(results[2]!.reason!.code).toBe('DEPENDENCY_FAILED');
      expect(kit.applied).toEqual([day.clientId, independent.clientId]); // the children never ran
    });

    it('a dependency already delivered in an earlier push counts as satisfied', async () => {
      const day = record();
      await kit.push.execute(mr1, [day]);
      const call = record({ dependsOn: [day.clientId] });
      expect((await kit.push.execute(mr1, [call])).results[0]!.status).toBe('SYNCED');
    });

    it('a dependency that is nowhere is INVALID_DEPENDENCY; so is a record depending on itself; a loop fails all its members', async () => {
      const ghost = record({ dependsOn: [uuid()] });
      const selfish = record();
      selfish.dependsOn = [selfish.clientId];
      const x = record();
      const y = record({ dependsOn: [x.clientId] });
      x.dependsOn = [y.clientId];
      const fine = record();
      const { results } = await kit.push.execute(mr1, [ghost, selfish, x, y, fine]);
      expect(results.map((r) => [r.status, r.reason?.code])).toEqual([
        ['FAILED', 'INVALID_DEPENDENCY'],
        ['FAILED', 'INVALID_DEPENDENCY'],
        ['FAILED', 'INVALID_DEPENDENCY'],
        ['FAILED', 'INVALID_DEPENDENCY'],
        ['SYNCED', undefined],
      ]);
      expect(kit.applied).toEqual([fine.clientId]);
    });

    it('a child of an invalid record is also failed rather than applied', async () => {
      const ghost = record({ dependsOn: [uuid()] });
      const child = record({ dependsOn: [ghost.clientId] });
      const { results } = await kit.push.execute(mr1, [ghost, child]);
      expect(results.map((r) => r.reason?.code)).toEqual(['INVALID_DEPENDENCY', 'DEPENDENCY_FAILED']);
    });
  });

  describe('the phone’s clock (sign-off G3)', () => {
    it('judges on clientCreatedAt: not more than the skew ahead, not older than the max age', async () => {
      const now = kit.clock.current.getTime();
      const at = (ms: number) => record({ clientCreatedAt: new Date(now + ms) });
      const min = 60_000;
      const day = 24 * 60 * min;
      const okFuture = at(9 * min);
      const tooFuture = at(11 * min);
      const okOld = at(-6 * day);
      const tooOld = at(-8 * day);
      const { results } = await kit.push.execute(mr1, [okFuture, tooFuture, okOld, tooOld]);
      expect(results.map((r) => r.status)).toEqual(['SYNCED', 'FAILED', 'SYNCED', 'FAILED']);
      expect(results[1]!.reason!.code).toBe('CLIENT_TIME_INVALID');
      expect(results[3]!.reason!.code).toBe('CLIENT_TIME_INVALID');
    });

    it('follows the config, so Admin can widen or tighten it', async () => {
      kit.config.values.SYNC_MAX_AGE_DAYS = '1';
      const old = record({ clientCreatedAt: new Date(kit.clock.current.getTime() - 2 * 24 * 60 * 60_000) });
      expect((await kit.push.execute(mr1, [old])).results[0]!.reason!.code).toBe('CLIENT_TIME_INVALID');
      kit.config.values.SYNC_MAX_AGE_DAYS = '3';
      expect((await kit.push.execute(mr1, [old])).results[0]!.status).toBe('SYNCED');
    });

    it('a record already synced is answered from its receipt, not re-judged on its age', async () => {
      const a = record();
      await kit.push.execute(mr1, [a]);
      kit.clock.current = new Date('2026-10-30T00:00:00Z'); // weeks later
      expect((await kit.push.execute(mr1, [a])).results[0]!.status).toBe('ALREADY_SYNCED');
    });
  });

  describe('who and how much', () => {
    it('only an active FIELD employee can push', async () => {
      await expectStatus(kit.push.execute({ id: 'admin', role: 'ADMIN' }, [record()]), 403);
      await expectStatus(kit.push.execute({ id: 'gone', role: 'FIELD' }, [record()]), 403);
      await expectStatus(kit.push.execute({ id: 'nobody', role: 'FIELD' }, [record()]), 403);
      expect(kit.store).toHaveLength(0);
    });

    it('a batch over SYNC_MAX_BATCH, or reusing a client id, is refused outright (400)', async () => {
      kit.config.values.SYNC_MAX_BATCH = '2';
      await expectStatus(kit.push.execute(mr1, [record(), record(), record()]), 400);
      const a = record();
      await expectStatus(kit.push.execute(mr1, [a, { ...a }]), 400);
      expect(kit.store).toHaveLength(0);
    });

    it('a malformed setting is a fault naming its key, never a silent default', async () => {
      kit.config.values.SYNC_MAX_BATCH = 'lots';
      await expectStatus(kit.push.execute(mr1, [record()]), 500);
    });
  });

  it('a kind can only be registered once', () => {
    expect(() => kit.registry.register({ kind: 'CALL', apply: async () => ({ serverId: 'x' }) })).toThrow();
  });

  it('SyncRejection carries its code and message', () => {
    const r = new SyncRejection('X', 'why');
    expect([r.code, r.message]).toEqual(['X', 'why']);
  });
});
