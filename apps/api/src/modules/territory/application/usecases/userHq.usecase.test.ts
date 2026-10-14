import { beforeEach, describe, expect, it } from 'vitest';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { UserHqAssignment } from '../../domain/userHqAssignment.entity.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';
import { GetUserHqUseCase } from './getUserHq.usecase.js';
import { SetUserHqUseCase } from './setUserHq.usecase.js';

class FakeAssignments implements UserHqAssignmentRepositoryPort {
  rows: UserHqAssignment[] = [];
  async findActive(userId: string) {
    return this.rows.find((r) => r.userId === userId && r.status === 'active') ?? null;
  }
  async listForUser(userId: string) {
    return this.rows.filter((r) => r.userId === userId).reverse();
  }
  async endActive(userId: string, endedBy: string) {
    this.rows = this.rows.map((r) =>
      r.userId === userId && r.status === 'active'
        ? { ...r, status: 'inactive', unassignedAt: new Date(), unassignedBy: endedBy }
        : r,
    );
  }
  async create(input: { userId: string; hqId: string; assignedBy: string }) {
    if (await this.findActive(input.userId)) return null;
    const row: UserHqAssignment = {
      id: `a${this.rows.length + 1}`,
      ...input,
      status: 'active',
      assignedAt: new Date(),
      unassignedAt: null,
      unassignedBy: null,
    };
    this.rows.push(row);
    return row;
  }
}

const hqs: Hq[] = [
  { id: 'hq1', zoneId: 'z1', name: 'Siliguri', status: 'active' },
  { id: 'hq2', zoneId: 'z1', name: 'Jalpaiguri', status: 'active' },
  { id: 'hq3', zoneId: 'z2', name: 'Closed', status: 'inactive' },
];
const hqRepo = { findById: async (id: string) => hqs.find((h) => h.id === id) ?? null } as unknown as HqRepositoryPort;
const recorded: Array<{ userId: string; hqId: string; zoneId: string }> = [];
const users: UserDirectoryPort = {
  recordUserTerritory: async (userId, t) => {
    recorded.push({ userId, ...t });
  },
  findUserSummary: async (id) =>
    ({
      mr: { id: 'mr', employeeCode: 'E1', name: 'MR', role: 'FIELD' as const, status: 'active' as const },
      gone: { id: 'gone', employeeCode: 'E2', name: 'Gone', role: 'FIELD' as const, status: 'inactive' as const },
      hr: { id: 'hr', employeeCode: 'E3', name: 'HR', role: 'HR' as const, status: 'active' as const },
    })[id] ?? null,
};
const inline: TransactionRunnerPort = { run: (fn) => fn({}) };

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('Employee HQ', () => {
  let assignments: FakeAssignments;
  let set: SetUserHqUseCase;
  let get: GetUserHqUseCase;

  beforeEach(() => {
    recorded.length = 0;
    assignments = new FakeAssignments();
    set = new SetUserHqUseCase(assignments, hqRepo, users, inline);
    get = new GetUserHqUseCase(assignments, hqRepo);
  });

  it('sets an HQ, and a new one ends the old with history kept', async () => {
    await set.execute('mr', 'hq1', 'admin');
    expect(await get.current('mr')).toEqual({ hqId: 'hq1', zoneId: 'z1' });
    await set.execute('mr', 'hq2', 'hr');
    expect(await get.current('mr')).toEqual({ hqId: 'hq2', zoneId: 'z1' });
    const history = await get.history('mr');
    expect(history.map((h) => [h.hqName, h.status])).toEqual([
      ['Jalpaiguri', 'active'],
      ['Siliguri', 'inactive'],
    ]);
    expect(history[1]?.unassignedBy).toBe('hr');
  });

  it('treats setting the same HQ again as a no-op', async () => {
    const first = await set.execute('mr', 'hq1', 'admin');
    expect((await set.execute('mr', 'hq1', 'admin')).id).toBe(first.id);
    expect(assignments.rows).toHaveLength(1);
  });

  it('copies the current HQ and its zone to the employee, on a new HQ and again on the same one', async () => {
    await set.execute('mr', 'hq1', 'admin');
    expect(recorded).toEqual([{ userId: 'mr', hqId: 'hq1', zoneId: 'z1' }]);
    await set.execute('mr', 'hq2', 'admin');
    expect(recorded.at(-1)).toEqual({ userId: 'mr', hqId: 'hq2', zoneId: 'z1' });
    // Saving the same HQ changes nothing in Territory but repairs the copy if an earlier write failed.
    await set.execute('mr', 'hq2', 'admin');
    expect(recorded).toHaveLength(3);
  });

  it('copies nothing when the HQ is refused', async () => {
    await expectStatus(set.execute('mr', 'hq3', 'admin'), 409);
    expect(recorded).toEqual([]);
  });

  it('is null with no HQ set', async () => {
    expect(await get.current('mr')).toBeNull();
  });

  it('refuses non-field, inactive or unknown employees, and unknown or inactive HQs', async () => {
    await expectStatus(set.execute('hr', 'hq1', 'admin'), 400);
    await expectStatus(set.execute('gone', 'hq1', 'admin'), 409);
    await expectStatus(set.execute('nobody', 'hq1', 'admin'), 404);
    await expectStatus(set.execute('mr', 'nope', 'admin'), 400);
    await expectStatus(set.execute('mr', 'hq3', 'admin'), 409);
  });
});
