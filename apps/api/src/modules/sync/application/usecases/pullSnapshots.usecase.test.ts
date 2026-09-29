import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { SyncSourceDefinition } from '../../domain/syncSource.js';
import { canonicalize, versionOf } from '../snapshotVersion.js';
import { SyncSourceRegistry } from '../syncSourceRegistry.js';
import { PullSnapshotsUseCase } from './pullSnapshots.usecase.js';
import { FakeUsers } from './syncTestKit.js';

const mr1 = { id: 'mr1', role: 'FIELD' as const };
const NOW = new Date('2026-10-05T12:00:00Z');

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('snapshot versions', () => {
  it('equal content gives an equal version whatever the key order, and any change gives a different one', () => {
    const a = versionOf(canonicalize({ x: 1, y: { b: 2, a: [1, 2, { z: 1, w: 2 }] } }));
    const b = versionOf(canonicalize({ y: { a: [1, 2, { w: 2, z: 1 }], b: 2 }, x: 1 }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{40}$/);
    expect(versionOf(canonicalize({ x: 2, y: { b: 2, a: [1, 2, { z: 1, w: 2 }] } }))).not.toBe(a);
  });

  it('keeps array order (a source sorts its own lists), turns dates into ISO text, and drops undefined', () => {
    expect(versionOf(canonicalize([1, 2]))).not.toBe(versionOf(canonicalize([2, 1])));
    expect(canonicalize({ at: new Date('2026-10-05T12:00:00Z'), gone: undefined, none: null })).toEqual({ at: '2026-10-05T12:00:00.000Z', none: null });
  });
});

describe('Pull — the phone’s reference data', () => {
  let registry: SyncSourceRegistry;
  let pull: PullSnapshotsUseCase;
  let doctors: Record<string, string[]>;
  let calls: string[];

  beforeEach(() => {
    registry = new SyncSourceRegistry();
    doctors = { mr1: ['Dr A', 'Dr B'], mr2: ['Dr Z'] };
    calls = [];
    registry.register({
      name: 'fieldMasterData',
      async snapshot(userId) {
        calls.push(`fmd:${userId}`);
        return { doctors: doctors[userId] ?? [] };
      },
    });
    registry.register({ name: 'hr', async snapshot() { return { leaveYear: 2026, at: new Date('2026-04-01T00:00:00Z') }; } });
    pull = new PullSnapshotsUseCase(registry, new FakeUsers(), () => NOW);
  });

  it('a first pull returns every source’s whole snapshot with its version, and the server time', async () => {
    const r = await pull.execute(mr1, {}, null);
    expect(r.serverTime).toBe('2026-10-05T12:00:00.000Z');
    expect(Object.keys(r.sources)).toEqual(['fieldMasterData', 'hr']);
    expect(r.sources['fieldMasterData']).toEqual({ version: expect.stringMatching(/^[a-f0-9]{40}$/), data: { doctors: ['Dr A', 'Dr B'] } });
    expect(r.sources['hr']).toMatchObject({ data: { leaveYear: 2026, at: '2026-04-01T00:00:00.000Z' } });
  });

  it('sending back the versions it holds gets "unchanged" and no data', async () => {
    const first = await pull.execute(mr1, {}, null);
    const have = Object.fromEntries(Object.entries(first.sources).map(([k, v]) => [k, (v as { version: string }).version]));
    const second = await pull.execute(mr1, have, null);
    expect(second.sources['fieldMasterData']).toEqual({ version: have['fieldMasterData'], unchanged: true });
    expect(second.sources['hr']).toEqual({ version: have['hr'], unchanged: true });
    expect(JSON.stringify(second)).not.toContain('Dr A');
  });

  it('only the source that changed comes back with data — the others stay unchanged', async () => {
    const first = await pull.execute(mr1, {}, null);
    const have = Object.fromEntries(Object.entries(first.sources).map(([k, v]) => [k, (v as { version: string }).version]));
    doctors['mr1'] = ['Dr A']; // the MR lost a Route: a Doctor disappears from their set
    const second = await pull.execute(mr1, have, null);
    expect(second.sources['hr']).toMatchObject({ unchanged: true });
    expect(second.sources['fieldMasterData']).toMatchObject({ data: { doctors: ['Dr A'] } });
    expect((second.sources['fieldMasterData'] as { version: string }).version).not.toBe(have['fieldMasterData']);
  });

  it('a stale or made-up version simply gets the full snapshot', async () => {
    const r = await pull.execute(mr1, { fieldMasterData: 'f'.repeat(40) }, ['fieldMasterData']);
    expect(r.sources['fieldMasterData']).toMatchObject({ data: { doctors: ['Dr A', 'Dr B'] } });
  });

  it('is scoped to the caller: each MR gets only their own data', async () => {
    const a = await pull.execute(mr1, {}, ['fieldMasterData']);
    const b = await pull.execute({ id: 'mr2', role: 'FIELD' }, {}, ['fieldMasterData']);
    expect((a.sources['fieldMasterData'] as { data: { doctors: string[] } }).data.doctors).toEqual(['Dr A', 'Dr B']);
    expect((b.sources['fieldMasterData'] as { data: { doctors: string[] } }).data.doctors).toEqual(['Dr Z']);
    expect(calls).toEqual(['fmd:mr1', 'fmd:mr2']); // the source is only ever asked about the caller
  });

  it('`only` limits it to the named sources; an unknown name is a 400 that lists the real ones', async () => {
    const r = await pull.execute(mr1, {}, ['hr']);
    expect(Object.keys(r.sources)).toEqual(['hr']);
    expect(calls).toEqual([]); // the others weren't even read
    const err = await pull.execute(mr1, {}, ['nope']).catch((e: AppError) => e);
    expect((err as AppError).statusCode).toBe(400);
    expect(JSON.stringify((err as AppError).publicDetails)).toContain('fieldMasterData');
  });

  it('a source that fails is reported for that source alone — the rest still refresh, and nothing leaks', async () => {
    registry.register({ name: 'broken', async snapshot() { throw new Error('boom: mongodb://secret'); } });
    const r = await pull.execute(mr1, {}, null);
    expect(r.sources['broken']).toEqual({ error: { code: 'SOURCE_UNAVAILABLE', message: expect.any(String) } });
    expect(JSON.stringify(r.sources['broken'])).not.toContain('secret');
    expect(r.sources['fieldMasterData']).toMatchObject({ data: { doctors: ['Dr A', 'Dr B'] } });
    expect(r.sources['hr']).toMatchObject({ version: expect.any(String) });
  });

  it('only an active FIELD employee can pull', async () => {
    await expectStatus(pull.execute({ id: 'admin', role: 'ADMIN' }, {}, null), 403);
    await expectStatus(pull.execute({ id: 'gone', role: 'FIELD' }, {}, null), 403);
    await expectStatus(pull.execute({ id: 'nobody', role: 'FIELD' }, {}, null), 403);
  });
});

describe('the source registry', () => {
  const src = (name: string): SyncSourceDefinition => ({ name, snapshot: async () => ({}) });

  it('takes camelCase names, once each', () => {
    const r = new SyncSourceRegistry();
    r.register(src('fieldMasterData'));
    expect(() => r.register(src('fieldMasterData'))).toThrow();
    for (const bad of ['', 'Field', 'field-master', 'field master', '1abc']) expect(() => r.register(src(bad))).toThrow();
    expect(r.names()).toEqual(['fieldMasterData']);
  });
});
