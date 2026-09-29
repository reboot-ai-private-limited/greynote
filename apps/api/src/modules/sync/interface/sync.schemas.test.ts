import { describe, expect, it } from 'vitest';
import { pushBodySchema } from './sync.schemas.js';

const id = '11111111-1111-4111-8111-111111111111';
const rec = { clientId: id, kind: 'NEW_DOCTOR', clientCreatedAt: '2026-10-05T09:00:00+05:30', payload: { a: 1 } };

describe('push body', () => {
  it('parses a record, defaulting dependsOn and turning the time into a Date', () => {
    const { records } = pushBodySchema.parse({ records: [rec] });
    expect(records[0]).toMatchObject({ clientId: id, kind: 'NEW_DOCTOR', dependsOn: [] });
    expect(records[0]!.clientCreatedAt).toBeInstanceOf(Date);
    expect(records[0]!.clientCreatedAt.toISOString()).toBe('2026-10-05T03:30:00.000Z');
  });

  it('refuses an empty batch, a non-UUID id, a lower-case kind and a time without a timezone', () => {
    expect(pushBodySchema.safeParse({ records: [] }).success).toBe(false);
    expect(pushBodySchema.safeParse({ records: [{ ...rec, clientId: 'abc' }] }).success).toBe(false);
    expect(pushBodySchema.safeParse({ records: [{ ...rec, kind: 'new doctor' }] }).success).toBe(false);
    expect(pushBodySchema.safeParse({ records: [{ ...rec, clientCreatedAt: '2026-10-05T09:00:00' }] }).success).toBe(false);
    expect(pushBodySchema.safeParse({ records: [{ ...rec, dependsOn: ['nope'] }] }).success).toBe(false);
  });
});

describe('drafts bodies', () => {
  it('a draft needs a kind; a removal needs neither kind nor payload', async () => {
    const { putDraftsBodySchema } = await import('./sync.schemas.js');
    const base = { clientId: id, clientUpdatedAt: '2026-10-05T09:00:00+05:30' };
    expect(putDraftsBodySchema.safeParse({ drafts: [{ ...base, payload: {} }] }).success).toBe(false);
    const kept = putDraftsBodySchema.parse({ drafts: [{ ...base, kind: 'DR_CALL', payload: { a: 1 } }] });
    expect(kept.drafts[0]).toMatchObject({ deleted: false, kind: 'DR_CALL', payload: { a: 1 } });
    const gone = putDraftsBodySchema.parse({ drafts: [{ ...base, deleted: true }] });
    expect(gone.drafts[0]).toEqual({ clientId: id, clientUpdatedAt: new Date('2026-10-05T03:30:00Z'), deleted: true });
    expect(putDraftsBodySchema.safeParse({ drafts: [] }).success).toBe(false);
    expect(putDraftsBodySchema.safeParse({ drafts: [{ ...base, kind: 'x', clientId: 'nope' }] }).success).toBe(false);
  });

  it('the restore query defaults to 100 a page, caps at 200 and takes only a real cursor', async () => {
    const { listDraftsQuerySchema } = await import('./sync.schemas.js');
    expect(listDraftsQuerySchema.parse({}).limit).toBe(100);
    expect(listDraftsQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(listDraftsQuerySchema.safeParse({ after: 'abc' }).success).toBe(false);
    expect(listDraftsQuerySchema.parse({ after: 'a'.repeat(24), limit: '50' })).toEqual({ after: 'a'.repeat(24), limit: 50 });
  });
});
