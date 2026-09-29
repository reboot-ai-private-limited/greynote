import { describe, expect, it } from 'vitest';
import type { RoleName } from '@greynote/contracts';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ComplianceBlockEvent } from '../../domain/complianceBlock.entity.js';
import { OpenBlockExistsError, type ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { BlockUserUseCase } from './blockUser.usecase.js';

/** Transactions with an undo log, so "both or neither" is provable. */
class Tx {
  undo: Array<() => void> = [];
}
class Transactions implements TransactionRunnerPort {
  async run<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const tx = new Tx();
    try {
      return await fn(tx);
    } catch (err) {
      for (const u of tx.undo.reverse()) u();
      throw err;
    }
  }
}

function setup(over: { role?: RoleName; user?: Partial<User> } = {}) {
  const user: User = { id: 'u1', employeeCode: 'E1', name: 'MR', email: null, phone: null, status: 'active', roleId: 'role-1', passwordHash: 'x', lastLoginAt: null, isBlocked: false, ...over.user };
  const events: ComplianceBlockEvent[] = [];
  let failCreate = false;
  const users = {
    findById: async (id: string) => (id === user.id ? { ...user } : null),
    update: async (id: string, input: Partial<User>, ctx?: TransactionContext) => {
      const before = { ...user };
      Object.assign(user, input);
      (ctx as Tx).undo.push(() => Object.assign(user, before));
      return { ...user };
    },
  } as unknown as UserRepositoryPort;
  const roles = { findById: async () => ({ id: 'role-1', name: over.role ?? 'FIELD' }) } as unknown as RoleRepositoryPort;
  const blocks = {
    create: async (input: Omit<ComplianceBlockEvent, 'id'>, ctx?: TransactionContext) => {
      if (failCreate) throw new OpenBlockExistsError();
      if (events.some((e) => e.userId === input.userId && e.unblockedAt === null)) throw new OpenBlockExistsError();
      const row = { ...input, id: `b${events.length + 1}` };
      events.push(row);
      (ctx as Tx).undo.push(() => events.splice(events.indexOf(row), 1));
      return row;
    },
  } as unknown as ComplianceBlockRepositoryPort;
  const useCase = new BlockUserUseCase(users, roles, blocks, new Transactions(), () => new Date('2026-10-06T00:30:00Z'));
  return { user, events, useCase, raceLost: () => void (failCreate = true) };
}

describe('BlockUserUseCase', () => {
  it('records the block event and flips isBlocked together', async () => {
    const { user, events, useCase } = setup();
    expect(await useCase.execute('u1', 'DCR_MISSED_NO_LEAVE')).toBe(true);
    expect(user.isBlocked).toBe(true);
    expect(events).toEqual([{ id: 'b1', userId: 'u1', reason: 'DCR_MISSED_NO_LEAVE', blockedAt: new Date('2026-10-06T00:30:00Z'), unblockedBy: null, unblockedAt: null }]);
  });

  it('is idempotent: blocking someone already blocked changes nothing and says so', async () => {
    const { events, useCase } = setup();
    await useCase.execute('u1', 'DCR_MISSED_NO_LEAVE');
    expect(await useCase.execute('u1', 'DCR_MISSED_NO_LEAVE')).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('a simultaneous run that blocked them first is reported as already blocked, and leaves no half-write', async () => {
    const { user, events, useCase, raceLost } = setup();
    raceLost(); // the unique index refuses the second open block
    expect(await useCase.execute('u1', 'DCR_MISSED_NO_LEAVE')).toBe(false);
    expect(user.isBlocked).toBe(false); // rolled back with the refused event; the winner's own transaction set it
    expect(events).toHaveLength(0);
  });

  it('only an active FIELD employee can be blocked', async () => {
    for (const role of ['ADMIN', 'HR', 'ACCOUNTANT'] as const) {
      await expect(setup({ role }).useCase.execute('u1', 'x')).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(setup({ user: { status: 'inactive' } }).useCase.execute('u1', 'x')).rejects.toMatchObject({ statusCode: 409 });
    await expect(setup().useCase.execute('nobody', 'x')).rejects.toMatchObject({ statusCode: 404 });
  });
});
