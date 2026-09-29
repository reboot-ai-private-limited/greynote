import { beforeEach, describe, expect, it } from 'vitest';
import { makeKit } from '../application/usecases/syncTestKit.js';
import { SyncRejection } from '../domain/syncHandler.js';
import { Network, Phone, Server } from './phoneSimulator.js';

const MR = 'mr1';

/** A day's records as the server sees them: one row per record ever applied, by client id. */
const serverRows = (kit: ReturnType<typeof makeKit>) => kit.store.map((r) => r.clientId).sort();

describe('a phone using the sync protocol over a bad connection', () => {
  let kit: ReturnType<typeof makeKit>;
  let net: Network;
  let phone: Phone;
  let server: Server;
  const newPhone = (name: string, batch = 100) => new Phone(name, server, net, () => kit.clock.current, batch);

  beforeEach(() => {
    kit = makeKit('2026-10-05T18:00:00Z');
    kit.config.values.SYNC_MAX_BATCH = '100';
    // The DCR's own submit is just another kind — it commits the day, and depends on everything in it.
    kit.registry.register({
      kind: 'DCR_SUBMIT',
      async apply({ userId, clientId }, ctx) {
        const row = { id: `dcr-${kit.store.length + 1}`, clientId, userId, name: 'DCR' };
        kit.store.push(row);
        (ctx as { undo: Array<() => void> }).undo.push(() => kit.store.splice(kit.store.indexOf(row), 1));
        return { serverId: row.id };
      },
    });
    net = new Network();
    server = new Server(kit, MR);
    phone = newPhone('phone A');
    kit.clock.current = new Date('2026-10-05T18:00:00Z');
  });

  const callOf = (name: string, extra: Record<string, unknown> = {}) => phone.create('CALL', { name, ...extra });

  describe('an ordinary day', () => {
    it('sends everything once, parents first, and the DCR’s own submit last', async () => {
      const a = callOf('Dr A');
      const b = phone.create('CALL', { name: 'Follow-up A' }, [a]);
      const c = callOf('Chemist C');
      const out = await phone.submit({ finalKind: 'DCR_SUBMIT' });
      expect(out).toMatchObject({ submitted: true, failures: [] });
      expect(kit.applied.slice(0, 3).sort()).toEqual([a, b, c].sort());
      expect(kit.applied.indexOf(a)).toBeLessThan(kit.applied.indexOf(b));
      expect(kit.store.at(-1)!.name).toBe('DCR'); // committed last
      expect(kit.store).toHaveLength(4);
      expect(phone.live().every((r) => r.serverId !== null)).toBe(true);
    });

    it('works offline first: nothing reaches the server until Submit, backup included as drafts only', async () => {
      callOf('Dr A');
      callOf('Dr B');
      await phone.backup();
      expect(kit.store).toHaveLength(0);
      expect(kit.receipts.rows).toHaveLength(0);
      expect(kit.drafts.rows).toHaveLength(2);
    });
  });

  describe('a connection that drops', () => {
    it('before the server hears anything: the phone just tries again', async () => {
      const a = callOf('Dr A');
      net.script = ['dropBefore', 'dropBefore', 'ok'];
      const out = await phone.submit();
      expect(out).toMatchObject({ submitted: true, attempts: 3 });
      expect(kit.applied).toEqual([a]);
      expect(serverRows(kit)).toEqual([a]);
    });

    it('AFTER the server did the work, with the reply lost — the phone can’t tell, resends, and nothing is doubled', async () => {
      const a = callOf('Dr A');
      const b = phone.create('CALL', { name: 'B' }, [a]);
      net.script = ['dropAfter', 'dropAfter', 'ok'];
      const out = await phone.submit();
      expect(out).toMatchObject({ submitted: true, attempts: 3 });
      expect(serverRows(kit)).toEqual([a, b].sort()); // each exactly once
      expect(kit.applied).toEqual([a, b]); // and the handler ran once each, never for the resends
      expect(kit.receipts.rows).toHaveLength(2);
      expect(phone.state(a).serverId).not.toBeNull();
    });

    it('ends in exactly the state a clean run would have', async () => {
      const clean = makeKit('2026-10-05T18:00:00Z');
      const cleanPhone = new Phone('clean', new Server(clean, MR), new Network(), () => clean.clock.current);
      for (const n of ['A', 'B', 'C']) cleanPhone.create('CALL', { name: n });
      await cleanPhone.submit();

      for (const n of ['A', 'B', 'C']) callOf(n);
      net.script = ['dropAfter', 'dropBefore', 'dropAfter', 'ok'];
      await phone.submit();
      expect(kit.store.map((r) => r.name).sort()).toEqual(clean.store.map((r) => r.name).sort());
      expect(kit.store).toHaveLength(3);
    });

    it('a phone with no signal at all gives up without losing anything, and Submit works when it returns', async () => {
      callOf('Dr A');
      net.decide = () => 'dropBefore';
      expect((await phone.submit({ maxAttempts: 5 })).submitted).toBe(false);
      expect(kit.store).toHaveLength(0);
      expect(phone.live()).toHaveLength(1);
      net.decide = null;
      expect((await phone.submit()).submitted).toBe(true);
      expect(kit.store).toHaveLength(1);
    });
  });

  describe('a day too big for one request', () => {
    it('is sent in chunks; a child in a later chunk finds its parent by receipt; the DCR submit is in the last', async () => {
      const small = newPhone('small batches', 4);
      const root = small.create('CALL', { name: 'root' });
      const ids = [root];
      for (let i = 0; i < 9; i++) ids.push(small.create('CALL', { name: `c${i}` }, [root]));
      const out = await small.submit({ finalKind: 'DCR_SUBMIT' });
      expect(out).toMatchObject({ submitted: true });
      expect(net.calls).toBe(Math.ceil(11 / 4)); // 10 records + the DCR submit, 4 at a time
      expect(kit.store).toHaveLength(11);
      expect(kit.store.at(-1)!.name).toBe('DCR');
      expect(kit.applied[0]).toBe(root);
    });

    it('survives drops between chunks: what already synced is recognised, the rest goes through', async () => {
      const small = newPhone('small batches', 3);
      for (let i = 0; i < 8; i++) small.create('CALL', { name: `c${i}` });
      net.script = ['ok', 'dropAfter', 'dropBefore', 'ok', 'dropAfter', 'ok'];
      expect((await small.submit({ finalKind: 'DCR_SUBMIT' })).submitted).toBe(true);
      expect(kit.store).toHaveLength(9);
      expect(new Set(kit.store.map((r) => r.clientId)).size).toBe(9);
    });
  });

  describe('a record the server refuses', () => {
    it('keeps the day from being submitted, names the problem, and a fix plus another Submit finishes it', async () => {
      kit.registry.register({
        kind: 'SAMPLE_CALL',
        async apply({ userId, clientId, payload }, ctx) {
          const p = payload as { quantity: number };
          if (p.quantity > 2) throw new SyncRejection('SAMPLES_EXHAUSTED', 'Only 2 samples left.');
          const row = { id: `s-${kit.store.length + 1}`, clientId, userId, name: 'sample call' };
          kit.store.push(row);
          (ctx as { undo: Array<() => void> }).undo.push(() => kit.store.splice(kit.store.indexOf(row), 1));
          return { serverId: row.id };
        },
      });
      const ok = callOf('fine call');
      const bad = phone.create('SAMPLE_CALL', { quantity: 5 });
      const first = await phone.submit({ finalKind: 'DCR_SUBMIT' });
      expect(first.submitted).toBe(false);
      expect(first.failures).toEqual(expect.arrayContaining([{ clientId: bad, code: 'SAMPLES_EXHAUSTED' }]));
      expect(first.failures.some((f) => f.code === 'DEPENDENCY_FAILED')).toBe(true); // the DCR's own submit
      expect(kit.store.map((r) => r.name)).toEqual(['fine call']); // the good record synced; no DCR
      expect(phone.state(ok).serverId).not.toBeNull();

      phone.edit(bad, { quantity: 2 }); // the MR reduces it
      const second = await phone.submit({ finalKind: 'DCR_SUBMIT' });
      expect(second).toMatchObject({ submitted: true, failures: [] });
      expect(kit.store.map((r) => r.name).sort()).toEqual(['DCR', 'fine call', 'sample call']);
      expect(kit.applied.filter((c) => c === ok)).toHaveLength(1); // the good one wasn't applied again
    });
  });

  describe('a lost phone', () => {
    it('is restored on another from the private backup — as of its last upload — and the day is submitted from there', async () => {
      const a = callOf('Dr A');
      const b = callOf('Dr B');
      await phone.backup();
      const late = callOf('Made after the last upload');
      phone.edit(a, { name: 'Dr A, edited after the last upload' });
      // phone A is dropped in a river: `late` and the edit never left it
      const phoneB = newPhone('phone B');
      expect(await phoneB.restore()).toBe(2);
      expect(phoneB.live().map((r) => (r.payload as { name: string }).name).sort()).toEqual(['Dr A', 'Dr B']);
      expect(phoneB.live().some((r) => r.clientId === late)).toBe(false);

      phoneB.create('CALL', { name: 'New on B' });
      expect((await phoneB.submit({ finalKind: 'DCR_SUBMIT' })).submitted).toBe(true);
      expect(kit.store.map((r) => r.name).sort()).toEqual(['DCR', 'Dr A', 'Dr B', 'New on B']);
      expect(kit.store.filter((r) => r.clientId === b)).toHaveLength(1);
    });

    it('a submitted day does not come back on a new phone', async () => {
      callOf('Dr A');
      await phone.backup();
      await phone.submit();
      expect(await newPhone('phone B').restore()).toBe(0);
      expect(kit.drafts.rows).toHaveLength(0);
    });

    it('the old phone resurfacing after the day was submitted from the new one changes nothing', async () => {
      const a = callOf('Dr A');
      await phone.backup();
      const phoneB = newPhone('phone B');
      await phoneB.restore();
      await phoneB.submit();
      phone.edit(a, { name: 'edited on the old phone' });
      await phone.backup(); // its upload comes in late
      expect(kit.drafts.rows).toHaveLength(0); // answered SUBMITTED, never stored
      const out = await phone.submit(); // and its own Submit finds the record already synced
      expect(out.submitted).toBe(true);
      expect(kit.store.filter((r) => r.clientId === a)).toHaveLength(1);
      expect(kit.store.find((r) => r.clientId === a)!.name).toBe('Dr A'); // the submitted version stands
    });
  });

  describe('two phones, one MR', () => {
    it('the later edit wins whichever phone uploads last', async () => {
      const a = callOf('original');
      await phone.backup();
      const phoneB = newPhone('phone B');
      await phoneB.restore();
      kit.clock.current = new Date('2026-10-05T18:10:00Z');
      phoneB.edit(a, { name: 'edited on B at 18:10' });
      kit.clock.current = new Date('2026-10-05T18:20:00Z');
      phone.edit(a, { name: 'edited on A at 18:20' });
      await phone.backup(); // A (the later edit) uploads first
      await phoneB.backup(); // B's older edit arrives after
      expect((kit.drafts.rows[0]!.payload as { payload: { name: string } }).payload.name).toBe('edited on A at 18:20');
      const phoneC = newPhone('phone C');
      await phoneC.restore();
      expect((phoneC.live()[0]!.payload as { name: string }).name).toBe('edited on A at 18:20');
    });

    it('a removal on one phone is not undone by the other’s older copy', async () => {
      const a = callOf('Dr A');
      await phone.backup();
      const phoneB = newPhone('phone B');
      await phoneB.restore();
      kit.clock.current = new Date('2026-10-05T18:30:00Z');
      phone.remove(a);
      await phone.backup();
      await phoneB.backup(); // B has nothing dirty; its copy is older anyway
      expect(await newPhone('phone C').restore()).toBe(0);
    });
  });

  describe('a bad backup connection', () => {
    it('leaves the changes marked unsent and picks them up next time — nothing is skipped', async () => {
      const ids = [callOf('A'), callOf('B'), callOf('C')];
      net.script = ['dropAfter'];
      await phone.backup();
      expect(ids.every((id) => phone.state(id).dirty)).toBe(true); // the phone didn't hear the answer, so it resends
      await phone.backup();
      expect(ids.every((id) => !phone.state(id).dirty)).toBe(true);
      expect(kit.drafts.rows).toHaveLength(3); // the resend didn't double them
    });
  });

  describe('a phone with the wrong clock', () => {
    it('two hours fast: its records and drafts are refused with a reason it can show, and nothing is stored', async () => {
      phone.clockSkewMs = 2 * 60 * 60_000;
      const a = callOf('Dr A');
      await phone.backup();
      expect(phone.state(a).lastFailure?.code).toBe('CLIENT_TIME_INVALID');
      expect(kit.drafts.rows).toHaveLength(0);
      const out = await phone.submit();
      expect(out.submitted).toBe(false);
      expect(out.failures).toEqual([{ clientId: a, code: 'CLIENT_TIME_INVALID' }]);
      expect(kit.store).toHaveLength(0);
      phone.clockSkewMs = 0; // fixed
      phone.edit(a, { name: 'Dr A' });
      expect((await phone.submit()).submitted).toBe(true);
    });
  });

  describe('whatever the connection does (30 random days)', () => {
    /** A small deterministic PRNG so a failing seed can be replayed. */
    const rng = (seed: number) => () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let seed = 1; seed <= 30; seed++) {
      it(`seed ${seed}: the day converges — every record once, the DCR committed last, nothing doubled, no draft left`, async () => {
        const r = rng(seed);
        const local = new Network();
        const p = new Phone(`p${seed}`, new Server(kit, MR), local, () => kit.clock.current, 1 + Math.floor(r() * 6));
        const n = 3 + Math.floor(r() * 12);
        const made: string[] = [];
        for (let i = 0; i < n; i++) made.push(p.create('CALL', { name: `c${i}` }, r() < 0.4 && made.length ? [made[Math.floor(r() * made.length)]!] : []));
        if (r() < 0.5) p.edit(made[0]!, { name: 'edited' });
        local.decide = () => (r() < 0.25 ? 'dropBefore' : r() < 0.25 ? 'dropAfter' : 'ok');
        for (let k = 0; k < 3; k++) await p.backup();
        const out = await p.submit({ finalKind: 'DCR_SUBMIT', maxAttempts: 500 });

        expect(out.submitted).toBe(true);
        expect(kit.store).toHaveLength(n + 1); // every record + the DCR, each exactly once
        expect(new Set(kit.store.map((x) => x.clientId)).size).toBe(n + 1);
        expect(kit.store.at(-1)!.name).toBe('DCR');
        expect(kit.applied).toHaveLength(n); // the CALL handler ran once per call, never for a resend
        expect(kit.receipts.rows).toHaveLength(n + 1);
        expect(kit.drafts.rows).toHaveLength(0);
      });
    }
  });
});
