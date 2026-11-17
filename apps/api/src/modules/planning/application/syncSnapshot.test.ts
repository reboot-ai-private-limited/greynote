import { describe, expect, it, vi } from 'vitest';
import { makePlanningSource } from './syncSnapshot.js';

describe('the planning snapshot: doctors still owed', () => {
  const build = (owed: ReturnType<typeof vi.fn>) =>
    makePlanningSource({
      deadlines: { today: async () => '2026-11-18' },
      daily: { execute: async () => [] },
      monthly: { execute: async () => [] },
      offDays: { list: async () => [] },
      users: { namePeople: async () => [] },
      owed,
    } as never);

  it('carries the owed doctors for today, read at pull time rather than from a stored plan', async () => {
    const owed = vi.fn(async () => [{ doctorId: 'd1', carriedFrom: '2026-11-17' }]);
    const snap = await build(owed).snapshot('u1');
    expect(owed).toHaveBeenCalledWith('u1', '2026-11-18');
    expect(snap).toMatchObject({ today: '2026-11-18', owedDoctors: [{ doctorId: 'd1', carriedFrom: '2026-11-17' }] });
  });

  it('is an empty list when nothing is owed', async () => {
    expect((await build(vi.fn(async () => [])).snapshot('u1') as { owedDoctors: unknown[] }).owedDoctors).toEqual([]);
  });
});
