import { beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalKindDefinition } from '../../domain/approvalKind.js';
import type { ApprovalRequest } from '../../domain/approvalRequest.entity.js';
import type {
  ApprovalListFilter,
  ApprovalListPage,
  ApprovalRequestRepositoryPort,
  ExpectedState,
} from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ApprovalStatusChange } from '../../domain/approvalKind.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { BulkDecideApprovalUseCase } from './bulkDecideApproval.usecase.js';
import { DecideApprovalUseCase } from './decideApproval.usecase.js';
import { GetApprovalDetailUseCase } from './getApprovalDetail.usecase.js';
import { ListApprovalsUseCase } from './listApprovals.usecase.js';
import { ReopenApprovalUseCase } from './reopenApproval.usecase.js';
import { SubmitApprovalUseCase } from './submitApproval.usecase.js';
import { WithdrawApprovalUseCase } from './withdrawApproval.usecase.js';

class FakeRequests implements ApprovalRequestRepositoryPort {
  rows = new Map<string, ApprovalRequest>();
  async list(filter: ApprovalListFilter, page: ApprovalListPage) {
    const matches = [...this.rows.values()]
      .filter(
        (r) =>
          (!filter.statuses || filter.statuses.includes(r.status)) &&
          (!filter.kinds || filter.kinds.includes(r.kind)) &&
          (!filter.submitterIds || filter.submitterIds.includes(r.submitterId)),
      )
      .sort((a, b) => (a.submittedAt.getTime() - b.submittedAt.getTime()) * (page.sortOrder === 'asc' ? 1 : -1));
    const items =
      page.page !== undefined && page.pageSize !== undefined
        ? matches.slice((page.page - 1) * page.pageSize, page.page * page.pageSize)
        : matches;
    return { items, total: matches.length };
  }
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
  async transition(id: string, expected: ExpectedState, change: Parameters<ApprovalRequestRepositoryPort['transition']>[2]) {
    const row = this.rows.get(id);
    if (!row || row.status !== expected.status || row.cycle !== expected.cycle) return null;
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
const person = (id: string): DirectoryUser => ({
  id,
  employeeCode: id.toUpperCase(),
  name: id,
  role: ROLE[id]!,
  managerId: managerOf[id] ?? null,
});
const chainOf = (id: string): DirectoryUser[] => {
  const chain: DirectoryUser[] = [];
  for (let m = managerOf[id]; m; m = managerOf[m]) chain.push(person(m));
  return chain;
};
const users: UserDirectoryPort = {
  findUserSummary: async (id) => (id in ROLE ? person(id) : null),
  getUserSummaries: async (ids) => ids.filter((id) => id in ROLE).map(person),
  getDirectReports: async (managerId) => Object.keys(managerOf).filter((id) => managerOf[id] === managerId).map(person),
  getDownline: async (managerId) =>
    Object.keys(managerOf)
      .map((id) => ({ id, depth: chainOf(id).findIndex((m) => m.id === managerId) + 1 }))
      .filter((m) => m.depth > 0)
      .map((m) => ({ ...person(m.id), depth: m.depth })),
  getManagerChain: async (id) => chainOf(id),
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
const CHANGE: ApprovalKindDefinition = { kind: 'TEST_CHANGE', finalApproverRoles: ['ADMIN'], managerOnly: true };

/** The `APPROVAL_MANAGER_ONLY_KINDS` value; TEST_QUICK skips the final stage. */
let managerOnlyKinds: string;
const config: ConfigProviderPort = { get: async () => managerOnlyKinds };

let requests: FakeRequests;
let transactions: FakeTransactions;
let submit: SubmitApprovalUseCase;
let decide: DecideApprovalUseCase;
let withdraw: WithdrawApprovalUseCase;
let reopen: ReopenApprovalUseCase;
let lists: ListApprovalsUseCase;
let detail: GetApprovalDetailUseCase;
let bulk: BulkDecideApprovalUseCase;
/** What bulk handed its fault reporter. */
let faults: Array<{ requestId: string; err: unknown }>;

beforeEach(() => {
  faults = [];
  managerOf = { mr: 'asm', asm: 'nsm', asm2: 'nsm', nsm: null };
  managerOnlyKinds = ' test_quick , NONE';
  changes = [];
  handlerFails = false;
  requests = new FakeRequests();
  transactions = new FakeTransactions(requests);
  const kinds = new ApprovalKindRegistry();
  [PLAN, QUICK, LEAVE, CHANGE].forEach((k) => kinds.register(k));
  submit = new SubmitApprovalUseCase(requests, users, kinds, config);
  decide = new DecideApprovalUseCase(requests, users, kinds, transactions);
  withdraw = new WithdrawApprovalUseCase(requests, kinds, transactions);
  reopen = new ReopenApprovalUseCase(requests, kinds, transactions);
  lists = new ListApprovalsUseCase(requests, users, kinds);
  detail = new GetApprovalDetailUseCase(requests, users, kinds);
  bulk = new BulkDecideApprovalUseCase(decide, (requestId, err) => faults.push({ requestId, err }));
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

  it('a kind declared managerOnly ends at the manager whatever the config says, and Admin still can override', async () => {
    managerOnlyKinds = 'NONE';
    const req = await submitAs('mr', CHANGE.kind);
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

  it('a decision on a cycle the approver has not seen is refused', async () => {
    const req = await submitAs('mr');
    await withdraw.execute(req.id, as('mr'));
    await submitAs('mr'); // edited and resubmitted: cycle 2

    const stale = decide.execute({ requestId: req.id, actor: as('asm'), decision: 'APPROVE', expectedCycle: 1 });
    await expect(stale).rejects.toMatchObject({ statusCode: 409 });
    expect(requests.rows.get(req.id)).toMatchObject({ status: 'SUBMITTED', cycle: 2 });

    const seen = await decide.execute({ requestId: req.id, actor: as('asm'), decision: 'APPROVE', expectedCycle: 2 });
    expect(seen).toMatchObject({ status: 'MANAGER_APPROVED', cycle: 2 });
  });

  it('a withdraw + resubmit landing between the read and the write is a 409, not an approval of cycle 2', async () => {
    const req = await submitAs('mr');
    transactions.beforeNextRun = async () => {
      await withdraw.execute(req.id, as('mr'));
      await submitAs('mr');
    };
    await expect(approve(req.id, 'asm')).rejects.toMatchObject({ statusCode: 409 });
    const row = requests.rows.get(req.id);
    expect(row).toMatchObject({ status: 'SUBMITTED', cycle: 2 });
    expect(row?.history.some((h) => h.action === 'APPROVE')).toBe(false);
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

describe('lists', () => {
  const PAGE = { page: 1, pageSize: 20 };
  /** A request per (submitter, kind), submitted a millisecond apart so ordering is deterministic. */
  async function seed() {
    const out: Record<string, ApprovalRequest> = {};
    for (const [key, submitter, kind] of [
      ['mrPlan', 'mr', PLAN.kind],
      ['mrLeave', 'mr', LEAVE.kind],
      ['asmPlan', 'asm', PLAN.kind],
      ['nsmLeave', 'nsm', LEAVE.kind],
    ] as const) {
      out[key] = await submitAs(submitter, kind, key);
      requests.rows.set(out[key]!.id, { ...out[key]!, submittedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, Object.keys(out).length)) });
    }
    return out;
  }

  it("a manager's inbox is their direct reports' Stage-1 requests, with names and canAct", async () => {
    const r = await seed();
    const inbox = await lists.inbox(as('asm'), {}, PAGE);
    expect(inbox.items.map((i) => i.recordId)).toEqual(['mrPlan', 'mrLeave']);
    expect(inbox.items[0]).toMatchObject({ canAct: true, submitter: { id: 'mr', employeeCode: 'MR' } });
    await approve(r.mrPlan!.id, 'asm');
    expect((await lists.inbox(as('asm'), {}, PAGE)).items.map((i) => i.recordId)).toEqual(['mrLeave']);
  });

  it("HR's inbox is Leave only: manager-approved, or from a submitter with no manager", async () => {
    const r = await seed();
    expect((await lists.inbox(as('hr'), {}, PAGE)).items.map((i) => i.recordId)).toEqual(['nsmLeave']);
    await approve(r.mrLeave!.id, 'asm');
    await approve(r.mrPlan!.id, 'asm');
    expect((await lists.inbox(as('hr'), {}, PAGE)).items.map((i) => i.recordId)).toEqual(['mrLeave', 'nsmLeave']);
  });

  it("Admin's inbox is everything open, oldest first, filterable by status, kind and manager", async () => {
    const r = await seed();
    await approve(r.mrPlan!.id, 'asm');
    const all = await lists.inbox(as('admin'), {}, PAGE);
    expect(all.items.map((i) => i.recordId)).toEqual(['mrPlan', 'mrLeave', 'asmPlan', 'nsmLeave']);
    expect(all.items.every((i) => i.canAct)).toBe(true);
    expect((await lists.inbox(as('admin'), { status: 'MANAGER_APPROVED' }, PAGE)).items.map((i) => i.recordId)).toEqual(['mrPlan']);
    expect((await lists.inbox(as('admin'), { kind: LEAVE.kind }, PAGE)).total).toBe(2);
    expect((await lists.inbox(as('admin'), { managerId: 'asm' }, PAGE)).items.map((i) => i.recordId)).toEqual(['mrPlan', 'mrLeave']);
    expect((await lists.inbox(as('admin'), { status: 'APPROVED' }, PAGE)).total).toBe(0);
  });

  it('all: Admin sees every request in any status, newest first, and can filter to the decided ones', async () => {
    const r = await seed();
    await approve(r.mrPlan!.id, 'asm');
    await approve(r.mrPlan!.id, 'admin');
    const all = await lists.all(as('admin'), {}, PAGE);
    expect(all.items.map((i) => i.recordId)).toEqual(['nsmLeave', 'asmPlan', 'mrLeave', 'mrPlan']);
    expect((await lists.all(as('admin'), { status: 'APPROVED' }, PAGE)).items.map((i) => [i.recordId, i.status])).toEqual([['mrPlan', 'APPROVED']]);
    expect((await lists.all(as('admin'), { kind: LEAVE.kind }, PAGE)).total).toBe(2);
    expect((await lists.all(as('admin'), { managerId: 'asm' }, PAGE)).items.map((i) => i.recordId)).toEqual(['mrLeave', 'mrPlan']);
    // The inbox, by contrast, no longer shows the approved one.
    expect((await lists.inbox(as('admin'), {}, PAGE)).items.map((i) => i.recordId)).not.toContain('mrPlan');
  });

  it("all: HR sees Leave in any status and nothing else; others are refused", async () => {
    const r = await seed();
    await approve(r.mrLeave!.id, 'asm');
    await approve(r.mrLeave!.id, 'hr');
    const all = await lists.all(as('hr'), {}, PAGE);
    expect(all.items.map((i) => [i.recordId, i.status])).toEqual([
      ['nsmLeave', 'SUBMITTED'],
      ['mrLeave', 'APPROVED'],
    ]);
    expect((await lists.all(as('hr'), { kind: PLAN.kind }, PAGE)).total).toBe(0);
    await expect(lists.all(as('asm'), {}, PAGE)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('team: direct reports are actionable, deeper levels read-only', async () => {
    await seed();
    const team = await lists.team(as('nsm'), 'all', {}, PAGE);
    expect(team.items.map((i) => [i.recordId, i.canAct])).toEqual([
      ['asmPlan', true],
      ['mrLeave', false],
      ['mrPlan', false],
    ]);
    expect((await lists.team(as('nsm'), 'indirect', {}, PAGE)).total).toBe(2);
  });

  it('mine: only my own, newest first', async () => {
    await seed();
    expect((await lists.mine(as('mr'), {}, PAGE)).items.map((i) => i.recordId)).toEqual(['mrLeave', 'mrPlan']);
  });

  it('detail: named history; visible to submitter, their chain, Admin and HR-for-Leave; 404 for anyone else', async () => {
    const r = await seed();
    await approve(r.mrPlan!.id, 'asm', 'ok');
    const d = await detail.execute(r.mrPlan!.id, as('nsm'));
    expect(d.history.map((h) => [h.action, h.actor?.name])).toEqual([
      ['SUBMIT', 'mr'],
      ['APPROVE', 'asm'],
    ]);
    expect(d).toMatchObject({ canAct: false, canWithdraw: false, canReopen: false });
    await expect(detail.execute(r.mrPlan!.id, as('asm2'))).rejects.toMatchObject({ statusCode: 404 });
    await expect(detail.execute(r.mrPlan!.id, as('hr'))).rejects.toMatchObject({ statusCode: 404 });
    await expect(detail.execute(r.mrLeave!.id, as('hr'))).resolves.toMatchObject({ canAct: false });
    expect(await detail.execute(r.mrLeave!.id, as('mr'))).toMatchObject({ canWithdraw: true });
  });
});

describe('bulk', () => {
  it('decides each independently and reports per item', async () => {
    const a = await submitAs('mr', PLAN.kind, 'a');
    const b = await submitAs('mr', PLAN.kind, 'b');
    const other = await submitAs('asm', PLAN.kind, 'c');
    await reject(b.id, 'asm', 'no');

    const results = await bulk.execute({
      requests: [a, b, other, a].map((r) => ({ requestId: r.id, expectedCycle: r.cycle })),
      actor: as('asm'),
      decision: 'APPROVE',
    });
    expect(results).toEqual([
      { requestId: a.id, ok: true, status: 'MANAGER_APPROVED' },
      { requestId: b.id, ok: false, statusCode: 409, message: expect.any(String) },
      { requestId: other.id, ok: false, statusCode: 403, message: expect.any(String) },
    ]);
    expect(faults).toHaveLength(0);
  });

  it('a genuine fault on one item is reported and returned as a 500 for it; the rest still go through', async () => {
    const a = await submitAs('mr', PLAN.kind, 'a');
    const c = await submitAs('mr', PLAN.kind, 'c');
    // A request whose kind no module registers any more — acting on it is a wiring fault.
    const gone = { ...a, id: 'req-gone', kind: 'TEST_GONE', recordId: 'gone' };
    requests.rows.set(gone.id, gone);

    const results = await bulk.execute({
      requests: [a, gone, c].map((r) => ({ requestId: r.id, expectedCycle: r.cycle })),
      actor: as('admin'),
      decision: 'APPROVE',
    });
    expect(results).toEqual([
      { requestId: a.id, ok: true, status: 'APPROVED' },
      { requestId: gone.id, ok: false, statusCode: 500, message: 'Something went wrong. Please try again shortly.' },
      { requestId: c.id, ok: true, status: 'APPROVED' },
    ]);
    expect(faults.map((f) => f.requestId)).toEqual([gone.id]);
  });

  it("a failing owning-module handler is a fault for that item, not the whole batch", async () => {
    const a = await submitAs('mr', PLAN.kind, 'a');
    const leave = await submitAs('mr', LEAVE.kind, 'l');
    handlerFails = true; // PLAN's handler throws a plain Error; LEAVE has none

    const results = await bulk.execute({
      requests: [a, leave].map((r) => ({ requestId: r.id, expectedCycle: r.cycle })),
      actor: as('asm'),
      decision: 'APPROVE',
    });
    expect(results.map((r) => (r.ok ? r.status : r.statusCode))).toEqual([500, 'MANAGER_APPROVED']);
    expect(requests.rows.get(a.id)).toMatchObject({ status: 'SUBMITTED' });
    expect(faults).toHaveLength(1);
  });
});

describe('list date range', () => {
  it('an end before the start is a 400 on `to`', async () => {
    const range = { from: new Date('2026-09-28T00:00:00+05:30'), to: new Date('2026-09-27T23:59:59+05:30') };
    await expect(lists.mine(as('mr'), range, { page: 1, pageSize: 20 })).rejects.toMatchObject({
      statusCode: 400,
      publicDetails: { field: 'to' },
    });
  });
});
