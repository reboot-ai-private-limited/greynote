import { describe, expect, it } from 'vitest';
import { finaliseWaiting, relaxWorkflow } from './singleApprovalMigration.js';

const at = new Date('2026-10-23T10:00:00Z');
const submit = { action: 'SUBMIT', authority: 'SUBMITTER', actorId: 'emp', actorRole: 'MR', comment: null, at, resultingStatus: 'SUBMITTED', cycle: 1 };
const managerApprove = { action: 'APPROVE', authority: 'MANAGER', actorId: 'mgr', actorRole: 'MANAGER', comment: null, at, resultingStatus: 'MANAGER_APPROVED', cycle: 1 };

describe('relaxWorkflow', () => {
  it('makes a submitted two-step request one-approval, and leaves one already so', () => {
    expect(relaxWorkflow({ workflow: 'MANAGER_THEN_FINAL' })).toEqual({ $set: { workflow: 'MANAGER_ONLY' } });
    expect(relaxWorkflow({ workflow: 'MANAGER_ONLY' })).toBeNull();
  });
});

describe('finaliseWaiting', () => {
  it('approves the request on the manager approval and records the rollout', () => {
    const update = finaliseWaiting({ cycle: 1, history: [submit, managerApprove] }, at)!;
    expect(update.$set).toEqual({ status: 'APPROVED', workflow: 'MANAGER_ONLY', decidedAt: at });
    expect(update.$push.history).toMatchObject({ authority: 'AUTO', actorId: 'mgr', resultingStatus: 'APPROVED', cycle: 1 });
  });

  it('ignores a manager approval from an earlier cycle', () => {
    expect(finaliseWaiting({ cycle: 2, history: [submit, managerApprove] }, at)).toBeNull();
  });
});
