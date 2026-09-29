import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  GEOFENCE_COMPUTED_STATUSES,
  GEOFENCE_REASONS,
  SYNC_DRAFT_REASON_CODES,
  SYNC_DRAFT_STATUSES,
  SYNC_ENGINE_CODES,
  SYNC_RESULT_STATUSES,
  SYNC_SOURCE_NAMES,
  type SyncDraftsPage,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncPutDraftsRequest,
  type SyncPutDraftsResponse,
} from '@greynote/contracts';
import { evaluateGeofence } from '@/shared/geo/geofence.js';
import type { DraftsPage } from '../application/usecases/listDrafts.usecase.js';
import type { PullResponse } from '../application/usecases/pullSnapshots.usecase.js';
import type { PushResponse } from '../application/usecases/pushRecords.usecase.js';
import type { PutDraftsResponse } from '../application/usecases/putDrafts.usecase.js';
import { DRAFT_CODES, DRAFT_STATUSES } from '../domain/syncDraft.entity.js';
import { SYNC_CODES, SYNC_STATUSES } from '../domain/syncRecord.js';
import { listDraftsQuerySchema, pullQuerySchema, pushBodySchema, putDraftsBodySchema } from './sync.schemas.js';

/**
 * Pins `apps/api` to `@greynote/contracts` — the wire format the phone is built against. The type
 * checks fail the build if a response drifts from its contract; the runtime checks fail if the
 * server stops accepting what the contract says a phone may send.
 */

const id = '11111111-1111-4111-8111-111111111111';

describe('the responses the server builds are exactly the contract’s types', () => {
  it('push, draft upload and draft restore', () => {
    expectTypeOf<PushResponse>().toEqualTypeOf<SyncPushResponse>();
    expectTypeOf<PutDraftsResponse>().toEqualTypeOf<SyncPutDraftsResponse>();
    expectTypeOf<DraftsPage>().toEqualTypeOf<SyncDraftsPage>();
  });

  it('pull: the envelope is the contract’s, and each source is built to its snapshot type (checked where they are written)', () => {
    expectTypeOf<PullResponse['serverTime']>().toEqualTypeOf<SyncPullResponse['serverTime']>();
    expectTypeOf<keyof SyncPullResponse['sources']>().toEqualTypeOf<(typeof SYNC_SOURCE_NAMES)[number]>();
    expect([...SYNC_SOURCE_NAMES]).toEqual(['config', 'fieldMasterData', 'hr', 'planning', 'territory']);
  });
});

describe('what the contract says a phone may send, the server accepts', () => {
  it('a push', () => {
    const request: SyncPushRequest = {
      records: [
        { clientId: id, kind: 'NEW_DOCTOR', dependsOn: [], clientCreatedAt: '2026-10-05T09:00:00+05:30', payload: {} },
        { clientId: '22222222-2222-4222-8222-222222222222', kind: 'DCR_SUBMIT', dependsOn: [id], clientCreatedAt: '2026-10-05T18:00:00Z', payload: null },
      ],
    };
    const parsed = pushBodySchema.parse(request);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[1]!.dependsOn).toEqual([id]);
  });

  it('a draft upload, kept or removed', () => {
    const request: SyncPutDraftsRequest = {
      drafts: [
        { clientId: id, clientUpdatedAt: '2026-10-05T10:00:00Z', kind: 'DR_CALL', payload: { a: 1 } },
        { clientId: '22222222-2222-4222-8222-222222222222', clientUpdatedAt: '2026-10-05T10:05:00Z', deleted: true },
      ],
    };
    const parsed = putDraftsBodySchema.parse(request);
    expect(parsed.drafts.map((d) => d.deleted)).toEqual([false, true]);
  });

  it('a pull, and a draft restore', () => {
    expect(pullQuerySchema.parse({ v: { fieldMasterData: 'a'.repeat(40) }, only: 'hr,territory' })).toEqual({ v: { fieldMasterData: 'a'.repeat(40) }, only: ['hr', 'territory'] });
    expect(listDraftsQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });
});

describe('the vocabularies match, value for value', () => {
  it('result and draft statuses', () => {
    expect([...SYNC_RESULT_STATUSES]).toEqual([...SYNC_STATUSES]);
    expect([...SYNC_DRAFT_STATUSES]).toEqual([...DRAFT_STATUSES]);
  });

  it('the engine’s codes and the draft codes', () => {
    expect([...SYNC_ENGINE_CODES].sort()).toEqual(Object.values(SYNC_CODES).sort());
    expect(new Set([...SYNC_DRAFT_REASON_CODES])).toEqual(new Set(Object.values(DRAFT_CODES)));
  });

  it('the geofence: the function answers only what the contract lists, for every reason', () => {
    const clinic = { latitude: 26.7, longitude: 88.4 };
    const seen = new Set<string>();
    const reasons = new Set<string | null>();
    for (const r of [
      evaluateGeofence({ registered: clinic, captured: clinic, accuracyMeters: 5, radiusMeters: 200, maxAccuracyMeters: 100 }),
      evaluateGeofence({ registered: clinic, captured: { latitude: 27, longitude: 88.4 }, accuracyMeters: 5, radiusMeters: 200, maxAccuracyMeters: 100 }),
      evaluateGeofence({ registered: null, captured: clinic, accuracyMeters: 5, radiusMeters: 200, maxAccuracyMeters: 100 }),
      evaluateGeofence({ registered: clinic, captured: clinic, accuracyMeters: 500, radiusMeters: 200, maxAccuracyMeters: 100 }),
      evaluateGeofence({ registered: clinic, captured: null, accuracyMeters: null, radiusMeters: 200, maxAccuracyMeters: 100 }),
    ]) {
      seen.add(r.status);
      reasons.add(r.reason);
    }
    expect([...seen].sort()).toEqual([...GEOFENCE_COMPUTED_STATUSES].sort());
    expect([...reasons].filter((x): x is string => x !== null).sort()).toEqual([...GEOFENCE_REASONS].sort());
  });
});
