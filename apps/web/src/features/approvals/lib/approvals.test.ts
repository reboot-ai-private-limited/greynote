import type { ApprovalActionDto, BulkResultDto } from '@greynote/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { resetSiteConfig, setSiteConfig } from '@/lib/siteConfig';
import {
  actionLabel,
  buildBulkBody,
  bulkMessage,
  chunkRows,
  dateRangeError,
  dateRangeToInstants,
  groupByCycle,
  kindLabel,
  requestDetail,
  requestTitle,
  searchTerm,
  reasonError,
  runBulk,
  UNCONFIRMED_MESSAGE,
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

describe('requestTitle and requestDetail', () => {
  const doctor = {
    kind: 'NEW_DOCTOR',
    subject: { title: 'Dr Jayanta Ishore', subtitle: 'Naxalbari · SLG-1' },
    submitter: { id: 'u1', name: 'Asha', employeeCode: 'GHC006' },
    cycle: 2,
  };
  it('names a doctor by their name, with the place and sender underneath', () => {
    expect(requestTitle(doctor)).toBe('Dr Jayanta Ishore');
    expect(requestDetail(doctor)).toBe('New doctor · Naxalbari · SLG-1 · Asha · GHC006 · resubmitted (round 2)');
  });
  it('leads a plan, report or month with who it is from', () => {
    const plan = { ...doctor, kind: 'MONTHLY_PLAN', subject: { title: 'Nov 2026', subtitle: null }, cycle: 2 };
    expect(requestTitle(plan)).toBe('Asha - Nov 2026');
    expect(requestDetail(plan)).toBe('Monthly plan · GHC006 · resubmitted (round 2)');
    expect(requestTitle({ ...plan, subject: null })).toBe('Monthly plan');
  });
  it('falls back to the kind for a request that says nothing about itself', () => {
    const leave = { ...doctor, kind: 'LEAVE', subject: null, cycle: 1 };
    expect(requestTitle(leave)).toBe('Leave');
    expect(requestDetail(leave)).toBe('Asha · GHC006');
  });
});

describe('searchTerm', () => {
  it('sends nothing under two letters, and the trimmed text from two', () => {
    expect(searchTerm('')).toBe('');
    expect(searchTerm(' m ')).toBe('');
    expect(searchTerm('  megha ')).toBe('megha');
  });
});

describe('stageLabel', () => {
  const item = (status: Parameters<typeof stageLabel>[0]['status'], kind = 'DCR') => ({
    kind,
    status,
    workflow: 'MANAGER_THEN_FINAL' as const,
  });
  it('says who a request is waiting on', () => {
    expect(stageLabel(item('SUBMITTED'))).toBe('Waiting on the manager');
    expect(stageLabel(item('MANAGER_APPROVED'))).toBe('Waiting on Admin');
    expect(stageLabel(item('MANAGER_APPROVED', 'LEAVE'))).toBe('Waiting on HR or Admin');
  });
  it('says either approver can decide a one-approval request', () => {
    expect(stageLabel({ kind: 'MONTHLY_PLAN', status: 'SUBMITTED', workflow: 'MANAGER_ONLY' })).toBe('Waiting on the manager or Admin');
  });
  it('says how a decided one ended', () => {
    expect(stageLabel(item('APPROVED'))).toBe('Approved');
    expect(stageLabel(item('WITHDRAWN'))).toBe('Withdrawn by the employee');
  });
});

describe('skipsManager', () => {
  it('warns only when Admin approves a request still waiting on the manager', () => {
    expect(skipsManager({ status: 'SUBMITTED', workflow: 'MANAGER_THEN_FINAL' }, 'ADMIN')).toBe(true);
    expect(skipsManager({ status: 'MANAGER_APPROVED', workflow: 'MANAGER_THEN_FINAL' }, 'ADMIN')).toBe(false);
    expect(skipsManager({ status: 'SUBMITTED', workflow: 'MANAGER_THEN_FINAL' }, 'HR')).toBe(false);
  });
  it('does not warn for a one-approval request: Admin deciding first is the ordinary path', () => {
    expect(skipsManager({ status: 'SUBMITTED', workflow: 'MANAGER_ONLY' }, 'ADMIN')).toBe(false);
  });
});

describe('actionLabel and groupByCycle', () => {
  const a = (
    action: ApprovalActionDto['action'],
    authority: ApprovalActionDto['authority'],
    cycle: number,
  ): ApprovalActionDto => ({
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
    const groups = groupByCycle([
      a('SUBMIT', 'SUBMITTER', 1),
      a('REJECT', 'MANAGER', 1),
      a('RESUBMIT', 'SUBMITTER', 2),
    ]);
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
    expect(dateRangeToInstants('2026-09-01', '')).toEqual({
      from: '2026-09-01T00:00:00.000+05:30',
    });
    expect(dateRangeToInstants('', '')).toEqual({});
  });
  it('is a valid instant for the server: ISO with an offset', () => {
    const { from, to } = dateRangeToInstants('2026-03-31', '2026-03-31');
    expect(Number.isNaN(new Date(from ?? '').getTime())).toBe(false);
    expect(new Date(to ?? '').getTime() - new Date(from ?? '').getTime()).toBe(
      24 * 3600 * 1000 - 1,
    );
  });
});

describe('dateRangeError', () => {
  it('refuses a reversed range, and allows the same day', () => {
    expect(dateRangeError('2026-09-05', '2026-09-01')).toBe(
      'The end date is before the start date.',
    );
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
    expect(buildBulkBody('REJECT', rows.slice(0, 1), '  not clear  ')).toEqual({
      decision: 'REJECT',
      requests: [{ id: 'a', cycle: 1 }],
      comment: 'not clear',
    });
    expect(buildBulkBody('APPROVE', rows.slice(3), ' ')).toEqual({
      decision: 'APPROVE',
      requests: [{ id: 'd', cycle: 3 }],
    });
  });
  it('splits more than 100 into batches of 100', () => {
    const many = Array.from({ length: 250 }, (_, i) => i);
    expect(chunkRows(many).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunkRows([])).toEqual([]);
  });
  it('summarises per-item results, keeping each failure', () => {
    const results: BulkResultDto[] = [
      { requestId: 'a', ok: true, status: 'APPROVED' },
      {
        requestId: 'b',
        ok: false,
        statusCode: 409,
        message: 'This was changed and resubmitted since you opened it. Reload it.',
      },
    ];
    const summary = summariseBulk(results);
    expect(summary.done).toBe(1);
    expect(summary.failed).toEqual([
      {
        requestId: 'b',
        statusCode: 409,
        message: 'This was changed and resubmitted since you opened it. Reload it.',
      },
    ]);
    expect(bulkMessage(summary, 2)).toMatch(/1 of 2 done. 1 could not be decided/);
    expect(bulkMessage({ done: 3, failed: [] }, 3)).toBe('3 of 3 done.');
  });
});

describe('runBulk', () => {
  const rows = Array.from({ length: 230 }, (_, i) => ({ id: `r${i}`, cycle: 1 }));
  const ok = (body: { requests: { id: string }[] }) => ({
    results: body.requests.map((r) => ({
      requestId: r.id,
      ok: true as const,
      status: 'APPROVED' as const,
    })),
  });

  it('sends batches of 100 in order and returns a result for every row', async () => {
    const sizes: number[] = [];
    const results = await runBulk(
      async (body) => {
        sizes.push(body.requests.length);
        return ok(body);
      },
      'APPROVE',
      rows,
      '',
    );
    expect(sizes).toEqual([100, 100, 30]);
    expect(results).toHaveLength(230);
    expect(results.every((r) => r.ok)).toBe(true);
  });
  it('passes the decision and the trimmed comment to every batch', async () => {
    const bodies: { decision: string; comment?: string }[] = [];
    await runBulk(
      async (body) => {
        bodies.push({ decision: body.decision, ...(body.comment && { comment: body.comment }) });
        return ok(body);
      },
      'REJECT',
      rows.slice(0, 150),
      '  not clear  ',
    );
    expect(bodies).toEqual([
      { decision: 'REJECT', comment: 'not clear' },
      { decision: 'REJECT', comment: 'not clear' },
    ]);
  });
  it('keeps per-item failures the server reported', async () => {
    const results = await runBulk(
      async (body) => ({
        results: body.requests.map(
          (
            r,
            i,
          ):
            | { requestId: string; ok: false; statusCode: number; message: string }
            | { requestId: string; ok: true; status: 'APPROVED' } =>
            i === 1
              ? { requestId: r.id, ok: false, statusCode: 409, message: 'stale' }
              : { requestId: r.id, ok: true, status: 'APPROVED' },
        ),
      }),
      'APPROVE',
      rows.slice(0, 3),
      '',
    );
    expect(summariseBulk(results)).toMatchObject({
      done: 2,
      failed: [{ requestId: 'r1', statusCode: 409 }],
    });
  });
  it('stops at a failed batch: its rows and every later row come back unconfirmed, none sent', async () => {
    let calls = 0;
    const results = await runBulk(
      async (body) => {
        calls += 1;
        if (calls === 2) throw new Error('network');
        return ok(body);
      },
      'APPROVE',
      rows,
      '',
    );
    expect(calls).toBe(2);
    expect(results).toHaveLength(230);
    expect(results.slice(0, 100).every((r) => r.ok)).toBe(true);
    const unconfirmed = results.slice(100);
    expect(unconfirmed).toHaveLength(130);
    expect(
      unconfirmed.every((r) => !r.ok && r.statusCode === 0 && r.message === UNCONFIRMED_MESSAGE),
    ).toBe(true);
  });
  it('sends nothing for no rows', async () => {
    let calls = 0;
    expect(
      await runBulk(
        async (b) => {
          calls += 1;
          return ok(b);
        },
        'APPROVE',
        [],
        '',
      ),
    ).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe('dateRangeToInstants follows the business timezone', () => {
  afterEach(resetSiteConfig);
  it('uses the offset of the configured timezone on each of the two days', () => {
    setSiteConfig({ financialYearStartMonth: 4, businessTimezone: 'Europe/London' });
    expect(dateRangeToInstants('2026-01-10', '2026-07-10')).toEqual({
      from: '2026-01-10T00:00:00.000+00:00',
      to: '2026-07-10T23:59:59.999+01:00',
    });
  });
  it('runs from the day start to one millisecond before the next day starts', () => {
    setSiteConfig({
      financialYearStartMonth: 4,
      businessTimezone: 'Asia/Kolkata',
      dayStartTime: '02:00',
    });
    expect(dateRangeToInstants('2026-10-01', '2026-10-03')).toEqual({
      from: '2026-09-30T20:30:00.000Z',
      to: '2026-10-03T20:29:59.999Z',
    });
  });
  it('is India’s +05:30 by default', () => {
    expect(dateRangeToInstants('2026-10-01', '2026-10-03')).toEqual({
      from: '2026-10-01T00:00:00.000+05:30',
      to: '2026-10-03T23:59:59.999+05:30',
    });
  });
});
