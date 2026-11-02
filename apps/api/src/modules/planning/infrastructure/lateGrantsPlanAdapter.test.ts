import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrant } from '@/modules/lateGrants/lateGrants.public.js';
import type { LateGrantsPublicContract } from '@/modules/lateGrants/lateGrants.public.js';
import { LateGrantsPlanAdapter } from './lateGrantsPlanAdapter.js';

const NOW = new Date('2026-11-02T06:00:00Z');
const grant: LateGrant = {
  id: 'g1', userId: 'u1', kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'r', grantedBy: 'a', grantedByRole: 'ADMIN',
  grantedAt: NOW, expiresAt: new Date('2026-11-03T06:00:00Z'), status: 'OPEN', usedAt: null, usedRef: null, revokedAt: null, revokedBy: null,
};

function adapter(lockedReason: string | null) {
  const consumed: string[] = [];
  const late = {
    grants: {
      findById: async () => grant,
      findUsable: async () => grant,
      create: async (input: { periodKey: string }) => ({ ...grant, periodKey: input.periodKey }),
      consume: async (id: string) => { consumed.push(id); return true; },
      revoke: async () => grant,
      list: async () => ({ items: [grant], total: 1 }),
    },
    locks: {
      reason: async () => lockedReason,
      assertOpen: async () => { if (lockedReason) throw new AppError({ statusCode: 409, code: 'GRANT_PERIOD_LOCKED', message: lockedReason }); },
    },
  } as unknown as LateGrantsPublicContract;
  return { adapter: new LateGrantsPlanAdapter(late), consumed };
}

describe('LateGrantsPlanAdapter', () => {
  it('speaks planKey to Planning while the store speaks periodKey', async () => {
    const { adapter: a } = adapter(null);
    const found = await a.findUsable('u1', 'MONTHLY_PLAN', '2026-10', NOW);
    expect(found).toMatchObject({ id: 'g1', planKey: '2026-10' });
    expect(found).not.toHaveProperty('periodKey');
  });

  it('treats a settled period as having no usable exception, and refuses to grant or spend one', async () => {
    const { adapter: a, consumed } = adapter('Payroll for 2026-10 is already finalized.');
    expect(await a.findUsable('u1', 'MONTHLY_PLAN', '2026-10', NOW)).toBeNull();
    await expect(a.create({ userId: 'u1', kind: 'MONTHLY_PLAN', planKey: '2026-10', reason: 'r', grantedBy: 'a', grantedByRole: 'ADMIN', grantedAt: NOW, expiresAt: NOW }, NOW)).rejects.toMatchObject({ code: 'GRANT_PERIOD_LOCKED' });
    await expect(a.consume('g1', NOW, {} as never)).rejects.toMatchObject({ code: 'GRANT_PERIOD_LOCKED' });
    expect(consumed).toEqual([]);
  });

  it('spends an open one when the period is open', async () => {
    const { adapter: a, consumed } = adapter(null);
    expect(await a.consume('g1', NOW, {} as never)).toBe(true);
    expect(consumed).toEqual(['g1']);
  });
});
