import { beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalKindDefinition } from '../../domain/approvalKind.js';
import type { ApprovalRequest, ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ApprovalStatusChange } from '../../domain/approvalKind.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { DecideApprovalUseCase } from './decideApproval.usecase.js';
import { ReopenApprovalUseCase } from './reopenApproval.usecase.js';
import { SubmitApprovalUseCase } from './submitApproval.usecase.js';
import { WithdrawApprovalUseCase } from './withdrawApproval.usecase.js';

class FakeRequests implements ApprovalRequestRepositoryPort {
  rows = new Map<string, ApprovalRequest>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByRecord(kind: string, recordId: string) {
    return [...this.rows.values()].find((r) => r.kind === kind && r.recordId === recordId) ?? null;
  }
  async create(input: Omit<ApprovalRequest, 'id'>) {
    const row = { ...input, id: `req-${this.rows.size + 1}` };
    this.rows.set(row.id, row);
    return row;
  }
  async transition(id: string, expected: ApprovalStatus, change: Parameters<ApprovalRequestRepositoryPort['transition']>[2]) {
    const row = this.rows.get(id);
    if (!row || row.status !== expected) return null;
    const updated = {
      ...row,
      ...change.newCycle,
      status: change.status,
      decidedAt: change.decidedAt,
      history: [...row.history, change.action],
    };
    this.rows.set(id, updated);
    return updated;
  }
}

/** Commits by keeping the rows; a throw inside `fn` restores them, like an aborted transaction. */
class FakeTransactions implements TransactionRunnerPort {
  /**
   * Runs once, before the next transaction starts — i.e. after the use case read the request but
   * before its conditional write: a competing decision committing in its own transaction.
   */
  beforeNextRun: (() => Promise<void>) | undefined;
  constructor(private readonly requests: FakeRequests) {}
  async run<T>(fn: (ctx: unknown) => Promise<T>): Promise<T> {
    const hook = this.beforeNextRun;
    this.beforeNextRun = undefined;
    await hook?.();
    const snapshot = new Map(this.requests.rows);
    try {
      return await fn('tx');
    } catch (err) {
      this.requests.rows = snapshot;
      throw err;
    }
  }
}

/** nsm (top) → asm → mr; plus an HR user and an Admin. Mutable, to reassign managers mid-test. */
let managerOf: Record<string, string | null>;
const ROLE: Record<string, Actor['role']> = { nsm: 'FIELD', asm: 'FIELD', asm2: 'FIELD', mr: 'FIELD', hr: 'HR', admin: 'ADMIN' };
const users: UserDirectoryPort = {
  findUserSummary: async (id) => (id in ROLE ? { id, role: ROLE[id]!, managerId: managerOf[id] ?? null } : null),
};
const as = (id: string): Actor => ({ id, role: ROLE[id]! });

/** Everything the owning module was told, and a switch to make its handler fail. */
let changes: Array<{ change: ApprovalStatusChange; ctx: unknown }>;
let handlerFails: boolean;
const onStatusChange = async (change: ApprovalStatusChange, ctx: unknown) => {
  if (handlerFails) throw new Error('owning module write failed');
  changes.push({ change, ctx });
};

const PLAN: ApprovalKindDefinition = { kind: 'TEST_PLAN', finalApproverRoles: ['ADMIN'], onStatusChange };
const QUICK: ApprovalKindDefinition = { kind: 'TEST_QUICK', finalApproverRoles: ['ADMIN'] };
const LEAVE: ApprovalKindDefinition = { kind: 'TEST_LEAVE', finalApproverRoles: ['HR', 'ADMIN'] };

/** The `APPROVAL_MANAGER_ONLY_KINDS` value; TEST_QUICK skips the final stage. */
let managerOnlyKinds: string;
const config: ConfigProviderPort = { get: async () => managerOnlyKinds };

let requests: FakeRequests;
let transactions: FakeTransactions;
let submit: SubmitApprovalUseCase;
let decide: DecideApprovalUseCase;
let withdraw: WithdrawApprovalUseCase;
let reopen: ReopenApprovalUseCase;

beforeEach(() => {
  managerOf = { mr: 'asm', asm: 'nsm', asm2: 'nsm', nsm: null };
  managerOnlyKinds = ' test_quick , NONE';
  changes = [];
  handlerFails = false;
  requests = new FakeRequests();
  transactions = new FakeTransactions(requests);
  const kinds = new ApprovalKindRegistry();
  [PLAN, QUICK, LEAVE].forEach((k) => kinds.register(k));
  submit = new SubmitApprovalUseCase(requests, users, kinds, config);
  decide = new DecideApprovalUseCase(requests, users, kinds, transactions);
  withdraw = new WithdrawApprovalUseCase(requests, kinds, transactions);
  reopen = new ReopenApprovalUseCase(requests, kinds, transactions);
});

const submitAs = (submitterId: string, kind = PLAN.kind, recordId = `rec-${submitterId}`) =>
  submit.execute({ kind, recordId, submitterId });
const approve = (requestId: string, actorId: string, comment?: string) =>
  decide.execute({ requestId, actor: as(actorId), decision: 'APPROVE', comment });
const reject = (requestId: string, actorId: string, comment?: string) =>
  decide.execute({ requestId, actor: as(actorId), decision: 'REJECT', comment });

describe('the standard two-stage flow', () => {
  it('goes MR → their manager → Admin, recording who acted and why they could', async () => {
    const req = await submitAs('mr');
    expect(req.status).toBe('SUBMITTED');

    expect((await approve(req.id, 'asm', 'Looks fine')).status).toBe('MANAGER_APPROVED');
    const done = await approve(req.id, 'admin');
    expect(done.status).toBe('APPROVED');
    expect(done.decidedAt).toBeInstanceOf(Date);
    expect(done.history.map((h) => [h.action, h.authority, h.actorId, h.resultingStatus])).toEqual([
      ['SUBMIT', 'SUBMITTER', 'mr', 'SUBMITTED'],
      ['APPROVE', 'MANAGER', 'asm', 'MANAGER_APPROVED'],
      ['APPROVE', 'FINAL', 'admin', 'APPROVED'],
    ]);
  });

  it("a manager's own request goes to their manager, not to themselves (ASM → NSM → Admin)", async () => {
    const req = await submitAs('asm');
    await expect(approve(req.id, 'asm')).rejects.toMatchObject({ statusCode: 403 });
    expect((await approve(req.id, 'nsm')).status).toBe('MANAGER_APPROVED');
  });

  it('only the direct manager acts at Stage 1 — a manager further up is read-only', async () => {
    const req = await submitAs('mr');
    await expect(approve(req.id, 'nsm')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('after the manager approves, only the final approvers can act', async () => {
    const req = await submitAs('mr');
    await approve(req.id, 'asm');
    await expect(approve(req.id, 'asm')).rejects.toMatchObject({ statusCode: 403 });
    await expect(approve(req.id, 'hr')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('rejection', () => {
  it('needs a reason, and can happen at either stage', async () => {
    const a = await submitAs('mr', PLAN.kind, 'a');
    await expect(reject(a.id, 'asm', '   ')).rejects.toMatchObject({ statusCode: 400, publicDetails: { field: 'comment' } });
    expect(await reject(a.id, 'asm', 'Wrong route')).toMatchObject({ status: 'REJECTED' });

    const b = await submitAs('mr', PLAN.kind, 'b');
    await approve(b.id, 'asm');
    const rejected = await reject(b.id, 'admin', 'Over budget');
    expect(rejected).toMatchObject({ status: 'REJECTED' });
    expect(rejected.history.at(-1)).toMatchObject({ authority: 'FINAL', comment: 'Over budget' });
  });

  it('a decided request cannot be acted on again', async () => {
    const req = await submitAs('mr');
    await reject(req.id, 'asm', 'No');
    await expect(approve(req.id, 'admin')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('special routes', () => {
  it('top of chain: the final approver decides alone, in one step', async () => {
    const req = await submitAs('nsm');
    const done = await approve(req.id, 'admin');
    expect(done).toMatchObject({ status: 'APPROVED' });
    expect(done.history.at(-1)?.authority).toBe('TOP_OF_CHAIN');
  });

  it('Admin can override the manager at Stage 1, and that approval is final', async () => {
    const req = await submitAs('mr');
    const done = await approve(req.id, 'admin');
    expect(done.status).toBe('APPROVED');
    expect(done.history.at(-1)?.authority).toBe('ADMIN_OVERRIDE');
  });

  it('kinds listed in APPROVAL_MANAGER_ONLY_KINDS end at the manager (case/space-insensitive)', async () => {
    const req = await submitAs('mr', QUICK.kind);
    expect(req.workflow).toBe('MANAGER_ONLY');
    expect((await approve(req.id, 'asm')).status).toBe('APPROVED');
  });

  it('Leave: HR can give the final approval; HR cannot act on other kinds or override the manager', async () => {
    const leave = await submitAs('mr', LEAVE.kind);
    await expect(approve(leave.id, 'hr')).rejects.toMatchObject({ statusCode: 403 });
    await approve(leave.id, 'asm');
    expect((await approve(leave.id, 'hr')).status).toBe('APPROVED');

    const plan = await submitAs('mr');
    await approve(plan.id, 'asm');
    await expect(approve(plan.id, 'hr')).rejects.toMatchObject({ statusCode: 403 });
  });

  it("the approver follows the submitter's CURRENT manager", async () => {
    const req = await submitAs('mr');
    managerOf.mr = 'asm2';
    await expect(approve(req.id, 'asm')).rejects.toMatchObject({ statusCode: 403 });
    expect((await approve(req.id, 'asm2')).status).toBe('MANAGER_APPROVED');
  });
});

describe('integrity', () => {
  it('one request per record', async () => {
    await submitAs('mr');
    await expect(submitAs('mr')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('when two approvers race, the second gets a 409 and the first decision stands', async () => {
    const req = await submitAs('mr');
    transactions.beforeNextRun = async () => {
      await reject(req.id, 'admin', 'Rejected first');
    };
    await expect(approve(req.id, 'asm')).rejects.toMatchObject({ statusCode: 409 });
    expect(requests.rows.get(req.id)?.status).toBe('REJECTED');
  });

  it('a kind must include ADMIN as a final approver, and can only be registered once', () => {
    const kinds = new ApprovalKindRegistry();
    expect(() => kinds.register({ kind: 'X', finalApproverRoles: ['HR'] })).toThrow();
    kinds.register(PLAN);
    expect(() => kinds.register(PLAN)).toThrow();
  });
});

describe('withdraw', () => {
  it('the submitter can withdraw until the manager acts, then edit and resubmit', async () => {
    const req = await submitAs('mr');
    const withdrawn = await withdraw.execute(req.id, as('mr'), 'Wrong date');
    expect(withdrawn).toMatchObject({ status: 'WITHDRAWN' });
    expect(withdrawn.history.at(-1)).toMatchObject({ action: 'WITHDRAW', authority: 'SUBMITTER', comment: 'Wrong date' });
  });

  it('only the submitter, and not once the manager has approved', async () => {
    const req = await submitAs('mr');
    await expect(withdraw.execute(req.id, as('asm'))).rejects.toMatchObject({ statusCode: 403 });
    await approve(req.id, 'asm');
    await expect(withdraw.execute(req.id, as('mr'))).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('resubmit', () => {
  it('after a rejection, starts cycle 2 on the same request with the full history kept', async () => {
    const first = await submitAs('mr');
    await reject(first.id, 'asm', 'Add the second route');
    const again = await submitAs('mr');

    expect(again).toMatchObject({ id: first.id, status: 'SUBMITTED', cycle: 2, decidedAt: null });
    expect(again.history.map((h) => [h.action, h.cycle])).toEqual([
      ['SUBMIT', 1],
      ['REJECT', 1],
      ['RESUBMIT', 2],
    ]);
    expect((await approve(again.id, 'asm')).history.at(-1)?.cycle).toBe(2);
  });

  it('picks up a workflow config change from the next cycle, never mid-cycle', async () => {
    const req = await submitAs('mr');
    managerOnlyKinds = 'TEST_PLAN';
    expect((await approve(req.id, 'asm')).status).toBe('MANAGER_APPROVED'); // still this cycle's workflow
    await reject(req.id, 'admin', 'Redo');
    const again = await submitAs('mr');
    expect(again.workflow).toBe('MANAGER_ONLY');
  });

  it('is refused while pending or approved, and for anyone but the submitter', async () => {
    const req = await submitAs('mr');
    await expect(submitAs('mr')).rejects.toMatchObject({ statusCode: 409 });
    await approve(req.id, 'admin');
    await expect(submitAs('mr')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('reopen') });
    await expect(submit.execute({ kind: PLAN.kind, recordId: 'rec-mr', submitterId: 'asm' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('reopen', () => {
  it('Admin can reopen an approved request (reason required); the submitter can then resubmit', async () => {
    const req = await submitAs('mr');
    await approve(req.id, 'asm');
    await approve(req.id, 'admin');

    await expect(reopen.execute(req.id, as('admin'), ' ')).rejects.toMatchObject({ statusCode: 400 });
    const reopened = await reopen.execute(req.id, as('admin'), 'Wrong doctor listed');
    expect(reopened).toMatchObject({ status: 'REOPENED', decidedAt: null });
    expect(reopened.history.at(-1)).toMatchObject({ action: 'REOPEN', authority: 'ADMIN_OVERRIDE' });
    expect((await submitAs('mr')).cycle).toBe(2);
  });

  it('only Admin, and only from APPROVED', async () => {
    const req = await submitAs('mr');
    await expect(reopen.execute(req.id, as('admin'), 'x')).rejects.toMatchObject({ statusCode: 409 });
    await approve(req.id, 'admin');
    await expect(reopen.execute(req.id, as('asm'), 'x')).rejects.toMatchObject({ statusCode: 403 });
    await expect(reopen.execute(req.id, as('hr'), 'x')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('owning-module callback', () => {
  it('fires on every decision, withdraw and reopen — inside the transaction — but not on submit', async () => {
    const a = await submitAs('mr', PLAN.kind, 'a');
    expect(changes).toHaveLength(0);
    await approve(a.id, 'asm');
    await approve(a.id, 'admin');
    await reopen.execute(a.id, as('admin'), 'fix');
    const b = await submitAs('mr', PLAN.kind, 'b');
    await withdraw.execute(b.id, as('mr'));

    expect(changes.map(({ change }) => [change.recordId, change.previousStatus, change.status])).toEqual([
      ['a', 'SUBMITTED', 'MANAGER_APPROVED'],
      ['a', 'MANAGER_APPROVED', 'APPROVED'],
      ['a', 'APPROVED', 'REOPENED'],
      ['b', 'SUBMITTED', 'WITHDRAWN'],
    ]);
    expect(changes.every(({ ctx }) => ctx === 'tx')).toBe(true);
    expect(changes[1]?.change.action).toMatchObject({ actorId: 'admin', authority: 'FINAL' });
  });

  it("a failing handler rolls the status change back, so the two can't disagree", async () => {
    const req = await submitAs('mr');
    handlerFails = true;
    await expect(approve(req.id, 'asm')).rejects.toThrow('owning module write failed');
    expect(requests.rows.get(req.id)).toMatchObject({ status: 'SUBMITTED' });
    expect(requests.rows.get(req.id)?.history).toHaveLength(1);
  });

  it('kinds without a handler work the same', async () => {
    const req = await submitAs('mr', LEAVE.kind);
    await expect(approve(req.id, 'asm')).resolves.toMatchObject({ status: 'MANAGER_APPROVED' });
  });
});
