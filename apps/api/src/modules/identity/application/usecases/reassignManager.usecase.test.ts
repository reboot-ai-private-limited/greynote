import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { ReassignManagerUseCase } from './reassignManager.usecase.js';

const LEVEL: Record<string, number> = { MR: 1, ASM: 2, RSM: 3, ZSM: 4 };

/** People as id → [name, designation, managerId]. */
function build(people: Record<string, [string, string, string | null]>) {
  const profiles = new Map(
    Object.entries(people).map(([id, [, d, m]]) => [id, { userId: id, designationId: d, managerId: m }]),
  );
  const recorded: unknown[] = [];
  const users = {
    findById: async (id: string) => (people[id] ? { id, name: people[id]![0] } : null),
    findByIds: async (ids: string[]) => ids.filter((id) => people[id]).map((id) => ({ id, name: people[id]![0] })),
  };
  const repo = {
    findByUserId: async (id: string) => profiles.get(id) ?? null,
    findByUserIds: async (ids: string[]) => ids.flatMap((id) => (profiles.has(id) ? [profiles.get(id)!] : [])),
    upsert: async (id: string, patch: { managerId?: string | null }) => {
      profiles.set(id, { ...profiles.get(id)!, ...patch } as never);
      return profiles.get(id);
    },
  };
  const designations = { findById: async (d: string) => ({ id: d, name: d, level: LEVEL[d] }) };
  const history = { record: async (r: unknown) => void recorded.push(r) };
  const useCase = new ReassignManagerUseCase(users as never, repo as never, designations as never, history as never, async () => '2026-10');
  return { useCase, profiles, recorded };
}

const org = {
  zsm1: ['Zed', 'ZSM', null],
  zsm2: ['Zoe', 'ZSM', null],
  rsm1: ['Ravi', 'RSM', 'zsm1'],
  rsm2: ['Rita', 'RSM', 'zsm1'],
  mr1: ['Mona', 'MR', 'rsm1'],
} as Record<string, [string, string, string | null]>;

describe('ReassignManagerUseCase', () => {
  it('moves everyone and records dated history', async () => {
    const { useCase, profiles, recorded } = build(org);
    const result = await useCase.execute('admin', { userIds: ['rsm1', 'rsm2'], managerId: 'zsm2' });
    expect(result.moved.map((m) => m.userId)).toEqual(['rsm1', 'rsm2']);
    expect(profiles.get('rsm1')!.managerId).toBe('zsm2');
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ source: 'BULK_REASSIGN', effectiveFrom: '2026-10', previousManagerId: 'zsm1', createdBy: 'admin' });
  });

  it('leaves people already under that manager alone', async () => {
    const { useCase, recorded } = build(org);
    const result = await useCase.execute('admin', { userIds: ['rsm1'], managerId: 'zsm1' });
    expect(result.unchanged.map((u) => u.userId)).toEqual(['rsm1']);
    expect(recorded).toHaveLength(0);
  });

  it('moves nothing when one person breaks the designation rule', async () => {
    const { useCase, profiles, recorded } = build(org);
    const error = await useCase.execute('admin', { userIds: ['mr1', 'rsm2'], managerId: 'rsm2' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).publicDetails).toMatchObject({ problems: [{ userId: 'rsm2' }] });
    expect(profiles.get('mr1')!.managerId).toBe('rsm1');
    expect(recorded).toHaveLength(0);
  });

  it('refuses a manager who reports to the person being moved', async () => {
    const { useCase } = build(org);
    await expect(useCase.execute('admin', { userIds: ['rsm1'], managerId: 'mr1' })).rejects.toBeInstanceOf(AppError);
  });

  it('refuses an unknown manager and an empty or oversized selection', async () => {
    const { useCase } = build(org);
    await expect(useCase.execute('admin', { userIds: ['rsm1'], managerId: 'nobody' })).rejects.toBeInstanceOf(AppError);
    await expect(useCase.execute('admin', { userIds: [], managerId: 'zsm2' })).rejects.toBeInstanceOf(AppError);
    const many = Array.from({ length: 101 }, (_, i) => `u${i}`);
    await expect(useCase.execute('admin', { userIds: many, managerId: 'zsm2' })).rejects.toBeInstanceOf(AppError);
  });
});
