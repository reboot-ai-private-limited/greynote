import { describe, expect, it } from 'vitest';
import type { ComplianceBlockEvent } from '../../domain/complianceBlock.entity.js';
import type { ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { UnblockUserUseCase } from './unblockUser.usecase.js';

const FAKE_CTX: TransactionContext = { fake: 'session' };

class FakeTransactionRunner implements TransactionRunnerPort {
  run<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(FAKE_CTX);
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    employeeCode: 'MR001',
    name: 'Jane MR',
    email: null,
    phone: null,
    status: 'active',
    roleId: 'role-field',
    passwordHash: 'x',
    lastLoginAt: null,
    isBlocked: true,
    ...overrides,
  };
}

class FakeUserRepository implements Pick<UserRepositoryPort, 'findById' | 'update'> {
  updates: Array<{ id: string; input: Partial<User>; ctx: TransactionContext | undefined }> = [];
  constructor(private user: User | null) {}
  async findById(): Promise<User | null> {
    return this.user;
  }
  async update(id: string, input: Partial<User>, ctx?: TransactionContext): Promise<User> {
    this.updates.push({ id, input, ctx });
    this.user = { ...(this.user as User), ...input };
    return this.user;
  }
}

class FakeComplianceBlockRepository
  implements Pick<ComplianceBlockRepositoryPort, 'findOpenByUserId' | 'close'>
{
  closed: Array<{ id: string; unblockedBy: string; ctx: TransactionContext | undefined }> = [];
  constructor(
    private openBlock: ComplianceBlockEvent | null,
    private failClose = false,
  ) {}
  async findOpenByUserId(): Promise<ComplianceBlockEvent | null> {
    return this.openBlock;
  }
  async close(id: string, unblockedBy: string, unblockedAt: Date, ctx?: TransactionContext): Promise<void> {
    if (this.failClose) throw new Error('Mongo write failed');
    this.closed.push({ id, unblockedBy, ctx });
  }
}

const OPEN_BLOCK: ComplianceBlockEvent = {
  id: 'block-1',
  userId: 'user-1',
  reason: 'DCR_MISSED_NO_LEAVE',
  blockedAt: new Date('2026-01-01'),
  unblockedBy: null,
  unblockedAt: null,
};

describe('UnblockUserUseCase', () => {
  it('rejects a non-Admin caller', async () => {
    const useCase = new UnblockUserUseCase(
      new FakeUserRepository(makeUser()) as unknown as UserRepositoryPort,
      new FakeComplianceBlockRepository(OPEN_BLOCK) as unknown as ComplianceBlockRepositoryPort,
      new FakeTransactionRunner(),
    );
    await expect(useCase.execute('admin-1', 'HR', 'user-1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('closes the open ComplianceBlock and flips isBlocked, both in the same transaction context', async () => {
    const userRepository = new FakeUserRepository(makeUser({ isBlocked: true }));
    const complianceBlockRepository = new FakeComplianceBlockRepository(OPEN_BLOCK);
    const useCase = new UnblockUserUseCase(
      userRepository as unknown as UserRepositoryPort,
      complianceBlockRepository as unknown as ComplianceBlockRepositoryPort,
      new FakeTransactionRunner(),
    );

    await useCase.execute('admin-1', 'ADMIN', 'user-1');

    expect(complianceBlockRepository.closed).toEqual([{ id: 'block-1', unblockedBy: 'admin-1', ctx: FAKE_CTX }]);
    expect(userRepository.updates).toEqual([{ id: 'user-1', input: { isBlocked: false }, ctx: FAKE_CTX }]);
  });

  it('is an idempotent no-op if the user is not currently blocked', async () => {
    const userRepository = new FakeUserRepository(makeUser({ isBlocked: false }));
    const complianceBlockRepository = new FakeComplianceBlockRepository(OPEN_BLOCK);
    const useCase = new UnblockUserUseCase(
      userRepository as unknown as UserRepositoryPort,
      complianceBlockRepository as unknown as ComplianceBlockRepositoryPort,
      new FakeTransactionRunner(),
    );

    await useCase.execute('admin-1', 'ADMIN', 'user-1');

    expect(complianceBlockRepository.closed).toHaveLength(0);
    expect(userRepository.updates).toHaveLength(0);
  });

  it('still clears isBlocked when no open ComplianceBlock is found (defensive)', async () => {
    const userRepository = new FakeUserRepository(makeUser({ isBlocked: true }));
    const complianceBlockRepository = new FakeComplianceBlockRepository(null);
    const useCase = new UnblockUserUseCase(
      userRepository as unknown as UserRepositoryPort,
      complianceBlockRepository as unknown as ComplianceBlockRepositoryPort,
      new FakeTransactionRunner(),
    );

    await useCase.execute('admin-1', 'ADMIN', 'user-1');

    expect(userRepository.updates).toEqual([{ id: 'user-1', input: { isBlocked: false }, ctx: FAKE_CTX }]);
  });

  it('never flips isBlocked if closing the ComplianceBlock fails — nothing partially committed', async () => {
    const userRepository = new FakeUserRepository(makeUser({ isBlocked: true }));
    const complianceBlockRepository = new FakeComplianceBlockRepository(OPEN_BLOCK, true);
    const useCase = new UnblockUserUseCase(
      userRepository as unknown as UserRepositoryPort,
      complianceBlockRepository as unknown as ComplianceBlockRepositoryPort,
      new FakeTransactionRunner(),
    );

    await expect(useCase.execute('admin-1', 'ADMIN', 'user-1')).rejects.toThrow('Mongo write failed');
    expect(userRepository.updates).toHaveLength(0);
  });
});
