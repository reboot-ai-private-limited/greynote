import { beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalKindDefinition } from '../../domain/approvalKind.js';
import type { ApprovalRequest, ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { DecideApprovalUseCase } from './decideApproval.usecase.js';
import { SubmitApprovalUseCase } from './submitApproval.usecase.js';

class FakeRequests implements ApprovalRequestRepositoryPort {
  rows = new Map<string, ApprovalRequest>();
  /** Runs inside `transition` before the status check — lets a test land a competing decision. */
  beforeTransition: (() => Promise<void>) | undefined;
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
    const hook = this.beforeTransition;
    this.beforeTransition = undefined;
    await hook?.();
    const row = this.rows.get(id);
    if (!row || row.status !== expected) return null;
    const updated = { ...row, status: change.status, decidedAt: change.decidedAt, history: [...row.history, change.action] };
    this.rows.set(id, updated);
    return updated;
  }
}

/** nsm (top) → asm → mr; plus an HR user and an Admin. Mutable, to reassign managers mid-test. */
let managerOf: Record<string, string | null>;
const ROLE: Record<string, Actor['role']> = { nsm: 'FIELD', asm: 'FIELD', asm2: 'FIELD', mr: 'FIELD', hr: 'HR', admin: 'ADMIN' };
const users: UserDirectoryPort = {
  findUserSummary: async (id) => (id in ROLE ? { id, role: ROLE[id]!, managerId: managerOf[id] ?? null } : null),
};
const as = (id: string): Actor => ({ id, role: ROLE[id]! });

const PLAN: ApprovalKindDefinition = { kind: 'TEST_PLAN', finalApproverRoles: ['ADMIN'], defaultWorkflow: 'MANAGER_THEN_FINAL' };
const QUICK: ApprovalKindDefinition = { kind: 'TEST_QUICK', finalApproverRoles: ['ADMIN'], defaultWorkflow: 'MANAGER_ONLY' };
const LEAVE: ApprovalKindDefinition = { kind: 'TEST_LEAVE', finalApproverRoles: ['HR', 'ADMIN'], defaultWorkflow: 'MANAGER_THEN_FINAL' };

let requests: FakeRequests;
let submit: SubmitApprovalUseCase;
let decide: DecideApprovalUseCase;

beforeEach(() => {
  managerOf = { mr: 'asm', asm: 'nsm', asm2: 'nsm', nsm: null };
  requests = new FakeRequests();
  const kinds = new ApprovalKindRegistry();
  [PLAN, QUICK, LEAVE].forEach((k) => kinds.register(k));
  submit = new SubmitApprovalUseCase(requests, users, kinds);
  decide = new DecideApprovalUseCase(requests, users, kinds);
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

  it('MANAGER_ONLY kinds end at the manager', async () => {
    const req = await submitAs('mr', QUICK.kind);
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
    requests.beforeTransition = async () => {
      await reject(req.id, 'admin', 'Rejected first');
    };
    await expect(approve(req.id, 'asm')).rejects.toMatchObject({ statusCode: 409 });
    expect(requests.rows.get(req.id)?.status).toBe('REJECTED');
  });

  it('a kind must include ADMIN as a final approver, and can only be registered once', () => {
    const kinds = new ApprovalKindRegistry();
    expect(() => kinds.register({ kind: 'X', finalApproverRoles: ['HR'], defaultWorkflow: 'MANAGER_ONLY' })).toThrow();
    kinds.register(PLAN);
    expect(() => kinds.register(PLAN)).toThrow();
  });
});
