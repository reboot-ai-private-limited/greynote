import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrant, LateGrantsPublicContract } from '@/modules/lateGrants/lateGrants.public.js';
import { LateGrantsExpenseAdapter } from './lateGrantsExpenseAdapter.js';

const NOW = new Date('2026-11-02T06:00:00Z');
const grant: LateGrant = {
  id: 'g1', userId: 'u1', kind: 'EXPENSE_APPROVE', periodKey: '2026-10', reason: 'r', grantedBy: 'a', grantedByRole: 'ADMIN',
  grantedAt: NOW, expiresAt: new Date('2026-11-03T06:00:00Z'), status: 'OPEN', usedAt: null, usedRef: null, revokedAt: null, revokedBy: null,
};

function adapter(lockedReason: string | null) {
  const created: unknown[] = [];
  const late = {
    grants: {
      findById: async () => grant,
      findUsable: async (_u: string, kind: string) => ({ ...grant, kind }),
      listUsable: async () => [grant],
      create: async (input: unknown) => { created.push(input); return grant; },
      consume: async () => true,
      list: async (filter: { kinds: string[] }) => ({ items: [grant], total: filter.kinds.length }),
    },
    locks: {
      reason: async () => lockedReason,
      assertOpen: async () => { if (lockedReason) throw new AppError({ statusCode: 409, code: 'GRANT_PERIOD_LOCKED', message: lockedReason }); },
    },
  } as unknown as LateGrantsPublicContract;
  return { a: new LateGrantsExpenseAdapter(late), created };
}

describe('LateGrantsExpenseAdapter', () => {
  it('maps phase to kind and month to period', async () => {
    const { a, created } = adapter(null);
    expect(await a.findUsable('u1', '2026-10', 'SUBMIT', NOW)).toMatchObject({ month: '2026-10', phase: 'SUBMIT' });
    expect(await a.findById('g1')).toMatchObject({ phase: 'APPROVE', month: '2026-10' });
    await a.create({ userId: 'u1', month: '2026-10', phase: 'APPROVE', reason: 'r', grantedBy: 'a', grantedByRole: 'ADMIN', grantedAt: NOW, expiresAt: NOW }, NOW);
    expect(created[0]).toMatchObject({ kind: 'EXPENSE_APPROVE', periodKey: '2026-10' });
    expect(created[0]).not.toHaveProperty('phase');
    expect(await a.list({}, { page: 1, pageSize: 10 })).toMatchObject({ total: 2 }); // only the two expense kinds
  });

  it('finds nothing, and refuses to grant or spend, once the month is finalized or paid', async () => {
    const { a } = adapter('The expenses for 2026-10 are finalized for payout.');
    expect(await a.findUsable('u1', '2026-10', 'APPROVE', NOW)).toBeNull();
    await expect(a.create({ userId: 'u1', month: '2026-10', phase: 'SUBMIT', reason: 'r', grantedBy: 'a', grantedByRole: 'ADMIN', grantedAt: NOW, expiresAt: NOW }, NOW)).rejects.toMatchObject({ code: 'GRANT_PERIOD_LOCKED' });
    await expect(a.consume('g1', NOW, {} as never)).rejects.toMatchObject({ code: 'GRANT_PERIOD_LOCKED' });
  });
});
