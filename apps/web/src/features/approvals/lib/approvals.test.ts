import type { ApprovalActionDto, BulkResultDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  buildBulkBody,
  bulkMessage,
  chunkRows,
  dateRangeError,
  dateRangeToInstants,
  groupByCycle,
  kindLabel,
  reasonError,
  selectableRows,
  skipsManager,
  stageLabel,
  summariseBulk,
} from './approvals';

describe('kindLabel', () => {
  it('names the known kinds and humanises an unknown one instead of hiding it', () => {
    expect(kindLabel('NEW_DOCTOR')).toBe('New doctor');
    expect(kindLabel('DCR')).toBe('Daily report');
    expect(kindLabel('EXPENSE_CLAIM')).toBe('Expense claim');
  });
});

describe('stageLabel', () => {
  const item = (status: Parameters<typeof stageLabel>[0]['status'], kind = 'DCR') => ({ kind, status, workflow: 'MANAGER_THEN_FINAL' as const });
  it('says who a request is waiting on', () => {
    expect(stageLabel(item('SUBMITTED'))).toBe('Waiting on the manager');
    expect(stageLabel(item('MANAGER_APPROVED'))).toBe('Waiting on Admin');
    expect(stageLabel(item('MANAGER_APPROVED', 'LEAVE'))).toBe('Waiting on HR or Admin');
  });
  it('says how a decided one ended', () => {
    expect(stageLabel(item('APPROVED'))).toBe('Approved');
    expect(stageLabel(item('WITHDRAWN'))).toBe('Withdrawn by the employee');
  });
});

describe('skipsManager', () => {
  it('warns only when Admin approves a request still waiting on the manager', () => {
    expect(skipsManager({ status: 'SUBMITTED' }, 'ADMIN')).toBe(true);
    expect(skipsManager({ status: 'MANAGER_APPROVED' }, 'ADMIN')).toBe(false);
    expect(skipsManager({ status: 'SUBMITTED' }, 'HR')).toBe(false);
  });
});

describe('actionLabel and groupByCycle', () => {
  const a = (action: ApprovalActionDto['action'], authority: ApprovalActionDto['authority'], cycle: number): ApprovalActionDto => ({
    action,
    authority,
    actorRole: 'ADMIN',
    comment: null,
    at: '2026-10-01T00:00:00Z',
    resultingStatus: 'APPROVED',
    cycle,
    actor: null,
  });
  it('shows the authority on a decision, so an override is visible', () => {
    expect(actionLabel(a('APPROVE', 'ADMIN_OVERRIDE', 1))).toBe('Approved as an Admin override');
    expect(actionLabel(a('REJECT', 'MANAGER', 1))).toBe('Rejected as the manager');
    expect(actionLabel(a('SUBMIT', 'SUBMITTER', 1))).toBe('Submitted');
  });
  it('groups a history by round, newest round first, keeping order inside a round', () => {
    const groups = groupByCycle([a('SUBMIT', 'SUBMITTER', 1), a('REJECT', 'MANAGER', 1), a('RESUBMIT', 'SUBMITTER', 2)]);
    expect(groups.map((g) => g.cycle)).toEqual([2, 1]);
    expect(groups[1]?.actions.map((x) => x.action)).toEqual(['SUBMIT', 'REJECT']);
  });
});

describe('dateRangeToInstants', () => {
  it('turns two dates into the start and last millisecond of those days in Indian time', () => {
    expect(dateRangeToInstants('2026-09-01', '2026-09-03')).toEqual({
      from: '2026-09-01T00:00:00.000+05:30',
      to: '2026-09-03T23:59:59.999+05:30',
    });
  });
  it('leaves out an end that is not given, and both when neither is', () => {
    expect(dateRangeToInstants('2026-09-01', '')).toEqual({ from: '2026-09-01T00:00:00.000+05:30' });
    expect(dateRangeToInstants('', '')).toEqual({});
  });
  it('is a valid instant for the server: ISO with an offset', () => {
    const { from, to } = dateRangeToInstants('2026-03-31', '2026-03-31');
    expect(Number.isNaN(new Date(from ?? '').getTime())).toBe(false);
    expect(new Date(to ?? '').getTime() - new Date(from ?? '').getTime()).toBe(24 * 3600 * 1000 - 1);
  });
});

describe('dateRangeError', () => {
  it('refuses a reversed range, and allows the same day', () => {
    expect(dateRangeError('2026-09-05', '2026-09-01')).toBe('The end date is before the start date.');
    expect(dateRangeError('2026-09-01', '2026-09-01')).toBeUndefined();
    expect(dateRangeError('2026-09-01', '')).toBeUndefined();
  });
});

describe('reasonError', () => {
  it('requires a reason only when told to, and caps its length', () => {
    expect(reasonError('', true)).toBe('Give a reason.');
    expect(reasonError('   ', true)).toBe('Give a reason.');
    expect(reasonError('', false)).toBeUndefined();
    expect(reasonError('x'.repeat(1001), false)).toMatch(/1000/);
  });
});

describe('bulk', () => {
  const rows = [
    { id: 'a', cycle: 1, canAct: true, status: 'SUBMITTED' as const },
    { id: 'b', cycle: 2, canAct: false, status: 'SUBMITTED' as const },
    { id: 'c', cycle: 1, canAct: true, status: 'APPROVED' as const },
    { id: 'd', cycle: 3, canAct: true, status: 'MANAGER_APPROVED' as const },
  ];
  it('selects only rows the caller can act on that are still open', () => {
    expect(selectableRows(rows).map((r) => r.id)).toEqual(['a', 'd']);
  });
  it('builds the body with each row at the cycle it showed, trimming the comment and omitting an empty one', () => {
    expect(buildBulkBody('REJECT', rows.slice(0, 1), '  not clear  ')).toEqual({ decision: 'REJECT', requests: [{ id: 'a', cycle: 1 }], comment: 'not clear' });
    expect(buildBulkBody('APPROVE', rows.slice(3), ' ')).toEqual({ decision: 'APPROVE', requests: [{ id: 'd', cycle: 3 }] });
  });
  it('splits more than 100 into batches of 100', () => {
    const many = Array.from({ length: 250 }, (_, i) => i);
    expect(chunkRows(many).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunkRows([])).toEqual([]);
  });
  it('summarises per-item results, keeping each failure', () => {
    const results: BulkResultDto[] = [
      { requestId: 'a', ok: true, status: 'APPROVED' },
      { requestId: 'b', ok: false, statusCode: 409, message: 'This was changed and resubmitted since you opened it. Reload it.' },
    ];
    const summary = summariseBulk(results);
    expect(summary.done).toBe(1);
    expect(summary.failed).toEqual([{ requestId: 'b', statusCode: 409, message: 'This was changed and resubmitted since you opened it. Reload it.' }]);
    expect(bulkMessage(summary, 2)).toMatch(/1 of 2 done. 1 could not be decided/);
    expect(bulkMessage({ done: 3, failed: [] }, 3)).toBe('3 of 3 done.');
  });
});
