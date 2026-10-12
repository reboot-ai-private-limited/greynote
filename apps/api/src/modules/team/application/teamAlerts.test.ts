import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type {
  AlertMarksPort,
  TeamApprovalPort,
  TeamInboxPort,
  WaitingRequest,
} from '../domain/ports.js';
import { TeamAlerts } from './teamAlerts.js';

const NOW = new Date('2026-10-12T06:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const req = (
  id: string,
  kind: string,
  submitterId: string,
  managerId: string,
  ageMs: number,
  overdue = false,
  cycle = 1,
): WaitingRequest => ({
  requestId: id,
  kind,
  recordId: `rec-${id}`,
  cycle,
  submitterId,
  managerId,
  submittedAt: new Date(NOW.getTime() - ageMs),
  dueAt: new Date(NOW.getTime() - ageMs + 3 * DAY),
  overdue,
});

const people = [
  { id: 'mr1', name: 'Asha', employeeCode: 'E1', managerId: 'asm' },
  { id: 'mr2', name: 'Bala', employeeCode: 'E2', managerId: 'asm' },
  { id: 'mr3', name: 'Chitra', employeeCode: 'E3', managerId: 'asm2' },
  { id: 'topper', name: 'Dev', employeeCode: 'E4', managerId: null },
];

let waiting: WaitingRequest[];
let sent: Array<{ to: string[]; title: string; body: string; kind: string }>;
let claimed: Set<string>;
let settings: Record<string, string>;
let reach: number;

const approvals: TeamApprovalPort = { listWaitingOnManagers: async () => waiting };
const inbox: TeamInboxPort = {
  notify: async (to, input) => {
    sent.push({ to, title: input.title, body: input.body, kind: input.kind });
    return reach;
  },
};
const marks: AlertMarksPort = {
  claim: async (keys) => keys.filter((k) => (claimed.has(k) ? false : (claimed.add(k), true))),
};
const config = {
  get: async (key: string) => {
    const v = settings[key];
    if (v === undefined) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
    return v;
  },
};
const alerts = () =>
  new TeamAlerts(
    approvals,
    { getUserSummaries: async (ids) => people.filter((p) => ids.includes(p.id)) },
    inbox,
    marks,
    config,
    () => NOW,
  );

beforeEach(() => {
  waiting = [];
  sent = [];
  claimed = new Set();
  settings = {};
  reach = 1;
});

describe('TeamAlerts: new requests', () => {
  it('tells the manager about a new leave, monthly-expenses or new-doctor request', async () => {
    waiting = [req('a', 'LEAVE', 'mr1', 'asm', HOUR)];
    const run = await alerts().runWaiting();
    expect(run).toMatchObject({ enabled: true, newRequests: 1, overdue: 0, managersNotified: 1 });
    expect(sent).toEqual([
      {
        to: ['asm'],
        title: 'Asha sent a leave request',
        body: expect.stringContaining('Asha sent a leave request'),
        kind: 'UPDATE',
      },
    ]);
  });

  it('leaves plans, daily reports and the rest to the badge', async () => {
    waiting = [
      req('a', 'DAILY_PLAN', 'mr1', 'asm', HOUR),
      req('b', 'DCR', 'mr1', 'asm', HOUR),
      req('c', 'SECONDARY_SALES', 'mr1', 'asm', HOUR),
      req('d', 'MONTHLY_PLAN', 'mr1', 'asm', HOUR),
    ];
    expect(await alerts().runWaiting()).toMatchObject({ newRequests: 0, overdue: 0 });
    expect(sent).toEqual([]);
  });

  it('sends one message per manager listing everyone, and a separate one to another manager', async () => {
    waiting = [
      req('a', 'LEAVE', 'mr1', 'asm', HOUR),
      req('b', 'EXPENSE_MONTH', 'mr2', 'asm', 2 * HOUR),
      req('c', 'NEW_DOCTOR', 'mr3', 'asm2', HOUR),
    ];
    const run = await alerts().runWaiting();
    expect(run).toMatchObject({ newRequests: 3, managersNotified: 2 });
    const toAsm = sent.find((s) => s.to[0] === 'asm')!;
    expect(toAsm.title).toBe('2 new requests from your team');
    expect(toAsm.body).toContain('Asha sent a leave request');
    expect(toAsm.body).toContain('Bala sent monthly expenses');
    expect(sent.find((s) => s.to[0] === 'asm2')!.title).toBe('Chitra sent a new doctor');
  });

  it('tells each request once, and a resubmission (new cycle) again', async () => {
    waiting = [req('a', 'LEAVE', 'mr1', 'asm', HOUR)];
    await alerts().runWaiting();
    await alerts().runWaiting();
    expect(sent).toHaveLength(1);
    waiting = [req('a', 'LEAVE', 'mr1', 'asm', HOUR, false, 2)];
    await alerts().runWaiting();
    expect(sent).toHaveLength(2);
  });

  it('does not announce as new something older than a day', async () => {
    waiting = [req('a', 'LEAVE', 'mr1', 'asm', 30 * HOUR)];
    expect(await alerts().runWaiting()).toMatchObject({ newRequests: 0 });
  });

  it('caps a long list and says how many more', async () => {
    waiting = Array.from({ length: 11 }, (_, i) => req(`x${i}`, 'LEAVE', 'mr1', 'asm', HOUR));
    await alerts().runWaiting();
    expect(sent[0]?.body).toContain('…and 3 more');
  });
});

describe('TeamAlerts: overdue', () => {
  it('reminds the manager of a request waiting too long, of any kind, once', async () => {
    waiting = [req('a', 'DAILY_PLAN', 'mr1', 'asm', 4 * DAY, true)];
    const run = await alerts().runWaiting();
    expect(run).toMatchObject({ newRequests: 0, overdue: 1, managersNotified: 1 });
    expect(sent[0]).toMatchObject({
      to: ['asm'],
      title: 'A request is waiting too long',
      kind: 'REMINDER',
    });
    expect(sent[0]?.body).toContain('Asha — a daily plan, waiting 4 days');
    expect(sent[0]?.body).toContain('Nothing is approved automatically');
    await alerts().runWaiting();
    expect(sent).toHaveLength(1);
  });

  it('a request still in time is not a reminder', async () => {
    waiting = [req('a', 'DAILY_PLAN', 'mr1', 'asm', DAY, false)];
    expect(await alerts().runWaiting()).toMatchObject({ overdue: 0 });
  });

  it('a new request that is already overdue gets both messages', async () => {
    waiting = [req('a', 'LEAVE', 'mr1', 'asm', 20 * HOUR, true)];
    expect(await alerts().runWaiting()).toMatchObject({ newRequests: 1, overdue: 1 });
    expect(sent.map((s) => s.kind).sort()).toEqual(['REMINDER', 'UPDATE']);
  });
});

describe('TeamAlerts: switch and blocked', () => {
  it('does nothing when Admin has turned the alerts off', async () => {
    settings['TEAM_ALERTS_ENABLED'] = 'false';
    waiting = [req('a', 'LEAVE', 'mr1', 'asm', HOUR)];
    expect(await alerts().runWaiting()).toMatchObject({ enabled: false, newRequests: 0 });
    expect(await alerts().notifyBlocked([{ userId: 'mr1', missedDates: ['2026-10-09'] }])).toBe(0);
    expect(sent).toEqual([]);
  });

  it('tells the manager who was blocked and for which days', async () => {
    expect(
      await alerts().notifyBlocked([
        { userId: 'mr1', missedDates: ['2026-10-08', '2026-10-09'] },
        { userId: 'mr2', missedDates: ['2026-10-09'] },
        { userId: 'mr3', missedDates: ['2026-10-09'] },
      ]),
    ).toBe(2);
    const toAsm = sent.find((s) => s.to[0] === 'asm')!;
    expect(toAsm.title).toBe('2 of your team are blocked');
    expect(toAsm.body).toContain('Asha — no report for 2026-10-08, 2026-10-09');
    expect(sent.find((s) => s.to[0] === 'asm2')!.title).toBe('Chitra is blocked');
  });

  it('skips someone with no manager, and does not count a manager the inbox could not reach', async () => {
    expect(await alerts().notifyBlocked([{ userId: 'topper', missedDates: ['2026-10-09'] }])).toBe(
      0,
    );
    reach = 0;
    expect(await alerts().notifyBlocked([{ userId: 'mr1', missedDates: ['2026-10-09'] }])).toBe(0);
  });
});
