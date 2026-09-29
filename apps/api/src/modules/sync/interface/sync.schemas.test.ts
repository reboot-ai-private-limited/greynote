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
