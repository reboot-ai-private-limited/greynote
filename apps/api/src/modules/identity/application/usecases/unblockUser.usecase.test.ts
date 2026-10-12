import { describe, expect, it } from 'vitest';
import type { ComplianceBlockEvent } from '../../domain/complianceBlock.entity.js';
import type { BlockClearing, ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
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
  closed: Array<{ id: string; clearing: BlockClearing; ctx: TransactionContext | undefined }> = [];
  constructor(
    private openBlock: ComplianceBlockEvent | null,
    private failClose = false,
  ) {}
  async findOpenByUserId(): Promise<ComplianceBlockEvent | null> {
    return this.openBlock;
  }
  async close(id: string, clearing: BlockClearing, ctx?: TransactionContext): Promise<void> {
    if (this.failClose) throw new Error('Mongo write failed');
    this.closed.push({ id, clearing, ctx });
  }
}

const OPEN_BLOCK: ComplianceBlockEvent = {
  id: 'block-1',
  userId: 'user-1',
  reason: 'DCR_MISSED_NO_LEAVE',
  blockedAt: new Date('2026-01-01'),
  unblockedBy: null,
  unblockedAt: null,
  unblockedByRole: null,
  unblockReason: null,
};

const NOW = new Date('2026-10-12T08:00:00Z');
/** `manager-1` is the employee's manager; `other-1` is not in their chain. */
const chain = async () => [{ id: 'manager-1' }, { id: 'boss-1' }];

function setup(opts: { user?: User; block?: ComplianceBlockEvent | null; failClose?: boolean } = {}) {
  const userRepository = new FakeUserRepository(opts.user ?? makeUser({ isBlocked: true }));
  const blocks = new FakeComplianceBlockRepository(opts.block === undefined ? OPEN_BLOCK : opts.block, opts.failClose);
  const useCase = new UnblockUserUseCase(
    userRepository as unknown as UserRepositoryPort,
    blocks as unknown as ComplianceBlockRepositoryPort,
    new FakeTransactionRunner(),
    chain,
    () => NOW,
  );
  return { userRepository, blocks, useCase };
}

describe('UnblockUserUseCase', () => {
  it('rejects HR, and an employee unblocking themselves', async () => {
    const { useCase } = setup();
    await expect(useCase.execute('hr-1', 'HR', 'user-1', 'ok')).rejects.toMatchObject({ statusCode: 403 });
    await expect(useCase.execute('user-1', 'FIELD', 'user-1', 'ok')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a manager who is not above the employee, as if the employee did not exist', async () => {
    const { useCase, blocks } = setup();
    await expect(useCase.execute('other-1', 'FIELD', 'user-1', 'ok')).rejects.toMatchObject({ statusCode: 404 });
    expect(blocks.closed).toHaveLength(0);
  });

  it('requires a reason', async () => {
    const { useCase, blocks } = setup();
    await expect(useCase.execute('admin-1', 'ADMIN', 'user-1', '   ')).rejects.toMatchObject({ statusCode: 400 });
    expect(blocks.closed).toHaveLength(0);
  });

  it('closes the open ComplianceBlock with who, role and why, and flips isBlocked, in the same transaction context', async () => {
    const { useCase, blocks, userRepository } = setup();

    await useCase.execute('admin-1', 'ADMIN', 'user-1', '  Network was down  ');

    expect(blocks.closed).toEqual([
      { id: 'block-1', clearing: { unblockedBy: 'admin-1', unblockedByRole: 'ADMIN', unblockReason: 'Network was down', unblockedAt: NOW }, ctx: FAKE_CTX },
    ]);
    expect(userRepository.updates).toEqual([{ id: 'user-1', input: { isBlocked: false }, ctx: FAKE_CTX }]);
  });

  it('lets any manager above the employee clear the block, recording their role', async () => {
    for (const manager of ['manager-1', 'boss-1']) {
      const { useCase, blocks } = setup();
      await useCase.execute(manager, 'FIELD', 'user-1', 'Was on a client visit');
      expect(blocks.closed[0]?.clearing).toMatchObject({ unblockedBy: manager, unblockedByRole: 'FIELD', unblockReason: 'Was on a client visit' });
    }
  });

  it('is an idempotent no-op if the user is not currently blocked', async () => {
    const { useCase, blocks, userRepository } = setup({ user: makeUser({ isBlocked: false }) });

    await useCase.execute('admin-1', 'ADMIN', 'user-1', 'ok');

    expect(blocks.closed).toHaveLength(0);
    expect(userRepository.updates).toHaveLength(0);
  });

  it('still clears isBlocked when no open ComplianceBlock is found (defensive)', async () => {
    const { useCase, userRepository } = setup({ block: null });

    await useCase.execute('admin-1', 'ADMIN', 'user-1', 'ok');

    expect(userRepository.updates).toEqual([{ id: 'user-1', input: { isBlocked: false }, ctx: FAKE_CTX }]);
  });

  it('never flips isBlocked if closing the ComplianceBlock fails — nothing partially committed', async () => {
    const { useCase, userRepository } = setup({ failClose: true });

    await expect(useCase.execute('admin-1', 'ADMIN', 'user-1', 'ok')).rejects.toThrow('Mongo write failed');
    expect(userRepository.updates).toHaveLength(0);
  });
});
