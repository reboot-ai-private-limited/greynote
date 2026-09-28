import { describe, expect, it } from 'vitest';
import { approveBodySchema, bulkDecideBodySchema, inboxQuerySchema, rejectBodySchema } from './approval.schemas.js';

const ID = 'a'.repeat(24);
const issuePaths = (result: { success: boolean; error?: { issues: Array<{ path: Array<string | number> }> } }) =>
  result.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('list date filters', () => {
  it('refuses a bare date — the server has no timezone to make it a day', () => {
    expect(issuePaths(inboxQuerySchema.safeParse({ to: '2026-09-28' }))).toEqual(['to']);
    expect(issuePaths(inboxQuerySchema.safeParse({ from: '2026-09-28T00:00:00' }))).toEqual(['from']);
  });

  it('takes an instant with its offset, as the exact instant', () => {
    const parsed = inboxQuerySchema.parse({ to: '2026-09-28T23:59:59.999+05:30' });
    expect(parsed.to).toEqual(new Date('2026-09-28T18:29:59.999Z'));
  });
});

describe('decision bodies', () => {
  it('approve and reject need the cycle the client displayed', () => {
    expect(issuePaths(approveBodySchema.safeParse({}))).toEqual(['cycle']);
    expect(issuePaths(rejectBodySchema.safeParse({ comment: 'No' }))).toEqual(['cycle']);
    expect(approveBodySchema.safeParse({ cycle: 2 }).success).toBe(true);
  });

  it('bulk takes { id, cycle } pairs, not bare ids', () => {
    expect(bulkDecideBodySchema.safeParse({ decision: 'APPROVE', requests: [{ id: ID, cycle: 1 }] }).success).toBe(true);
    expect(issuePaths(bulkDecideBodySchema.safeParse({ decision: 'APPROVE', requests: [{ id: ID }] }))).toEqual([
      'requests.0.cycle',
    ]);
    expect(bulkDecideBodySchema.safeParse({ decision: 'APPROVE', requestIds: [ID] }).success).toBe(false);
  });
});
