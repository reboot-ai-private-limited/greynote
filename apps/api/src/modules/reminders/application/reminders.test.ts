import { describe, expect, it } from 'vitest';
import { Reminders } from './reminders.js';
import type { FieldPerson, InboxPort, ReminderMarksPort } from '../domain/ports.js';

const CONFIG: Record<string, string> = {
  BUSINESS_TIMEZONE: 'Asia/Kolkata',
  DAY_START_TIME: '00:00',
  DAILY_PLAN_SUBMIT_CUTOFF_TIME: '10:00',
  MONTHLY_PLAN_SUBMIT_CUTOFF_DATE: '28',
  EXPENSE_SUBMIT_CUTOFF_DAY: '7',
  EXPENSE_APPROVAL_CUTOFF_DAY: '10',
  MONTHLY_STOCK_DEADLINE_DAY: '5',
  FY_CLOSED_YEARS: 'NONE',
  FY_START_MONTH: 'APRIL',
  REMINDERS_ENABLED: 'true',
  REMINDER_DAILY_FIRST_MINUTES: '120',
  REMINDER_DAILY_SECOND_MINUTES: '30',
  REMINDER_DAILY_AFTER_MINUTES: '30',
  REMINDER_MONTHLY_FIRST_DAYS: '3',
  REMINDER_MONTHLY_SECOND_DAYS: '1',
  REMINDER_DIGEST_MORNING_TIME: '10:30',
  REMINDER_DIGEST_EVENING_TIME: '17:00',
};

interface Sent {
  to: string[];
  title: string;
  body: string;
  data?: Record<string, string> | undefined;
}

function setup(opts: { now: string; config?: Record<string, string> }) {
  const sent: Sent[] = [];
  const claimed = new Set<string>();
  const people: FieldPerson[] = [
    { id: 'm', name: 'Manager', designationLevel: 2, managerId: null },
    { id: 'a', name: 'A', designationLevel: 1, managerId: 'm' },
    { id: 'b', name: 'B', designationLevel: 1, managerId: 'm' },
    { id: 'c', name: 'C', designationLevel: 1, managerId: 'm' },
  ];
  const state = {
    dailyStatus: {} as Record<string, string | null>,
    monthlyStatus: {} as Record<string, string | null>,
    off: new Set<string>(),
    leave: new Set<string>(),
    blocked: new Set<string>(),
    joined: {} as Record<string, Date | null>,
    unsubmittedExpenses: [] as string[],
    missingStock: [] as string[],
    waiting: [] as Array<{ kind: string; managerId: string }>,
  };
  const inbox: InboxPort = {
    notify: async (to, input) => {
      sent.push({ to, title: input.title, body: input.body, data: input.data });
      return to.length;
    },
  };
  const marks: ReminderMarksPort = {
    claim: async (keys) => keys.filter((k) => (claimed.has(k) ? false : (claimed.add(k), true))),
  };
  const values = opts.config ?? CONFIG;
  let now = new Date(opts.now);
  const reminders = new Reminders(
    {
      listFieldEmployees: async () => people,
      getEmploymentDetails: async (id) => ({ dateOfJoining: state.joined[id] ?? null }),
      isBlocked: async (id) => state.blocked.has(id),
    },
    {
      listOffDates: async (id) => (state.off.has(id) ? ['x'] : []),
      listLeaveDates: async (id) => (state.leave.has(id) ? ['x'] : []),
    },
    { getDailyPlanStatus: async (id) => state.dailyStatus[id] ?? null, getMonthlyPlanStatus: async (id) => state.monthlyStatus[id] ?? null },
    { listUnsubmittedExpenseUsers: async (_m, ids) => ids.filter((id) => state.unsubmittedExpenses.includes(id)) },
    { listMissingStock: async (_m, ids) => ids.filter((id) => state.missingStock.includes(id)).map((userId) => ({ userId })) },
    { listWaitingOnManagers: async (f) => state.waiting.filter((w) => !f?.kinds || f.kinds.includes(w.kind)) },
    inbox,
    marks,
    { get: async (key) => values[key] as string },
    () => now,
  );
  return { reminders, sent, state, setNow: (iso: string) => (now = new Date(iso)) };
}

// 15 Oct 2026 is a Thursday; the daily plan is due 10:00 IST = 04:30Z.
describe('daily plan reminders', () => {
  it('reminds the employees who have not sent it, and tells the manager how many', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z' }); // 08:10 IST
    t.state.dailyStatus = { a: 'SUBMITTED', b: null, c: 'DRAFT', m: 'APPROVED' };
    const run = await t.reminders.run();

    const employee = t.sent.find((s) => s.data?.stage === 'due');
    expect(employee?.to.sort()).toEqual(['b', 'c']);
    expect(employee?.title).toBe('Send today’s daily plan');
    expect(employee?.data).toMatchObject({ type: 'REMINDER_DAILY_PLAN', route: '/plan/daily' });
    const manager = t.sent.find((s) => s.data?.stage === 'team-due');
    expect(manager?.to).toEqual(['m']);
    expect(manager?.body).toContain('2 of 3 on your team');
    expect(run.employeesReminded).toBe(2);
    expect(run.managersTold).toBe(1);
  });

  it('sends each stage once, however often the job runs', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z' });
    await t.reminders.run();
    const first = t.sent.length;
    await t.reminders.run();
    await t.reminders.run();
    expect(t.sent.length).toBe(first);
  });

  it('reminds again at the second mark and says it was missed after the deadline', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z' });
    await t.reminders.run();
    t.setNow('2026-10-15T04:10:00Z'); // 09:40, 20 minutes ahead
    await t.reminders.run();
    expect(t.sent.some((s) => s.title === 'Send today’s daily plan' && s.body.includes('in 30 min'))).toBe(true);
    t.setNow('2026-10-15T04:35:00Z'); // 10:05
    await t.reminders.run();
    expect(t.sent.some((s) => s.title === 'Missed: today’s daily plan')).toBe(true);
    t.setNow('2026-10-15T05:05:00Z'); // 10:35: manager after-deadline
    await t.reminders.run();
    expect(t.sent.some((s) => s.data?.stage === 'team-missed')).toBe(true);
  });

  it('skips people on leave, on a day off, blocked, or not yet joined', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z' });
    t.state.leave.add('a');
    t.state.off.add('b');
    t.state.blocked.add('c');
    t.state.joined.m = new Date('2026-10-20T00:00:00Z');
    await t.reminders.run();
    expect(t.sent.filter((s) => s.data?.type === 'REMINDER_DAILY_PLAN')).toEqual([]);
  });

  it('sends nothing when nobody is missing a plan', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z' });
    t.state.dailyStatus = { a: 'SUBMITTED', b: 'APPROVED', c: 'MANAGER_APPROVED', m: 'SUBMITTED' };
    await t.reminders.run();
    expect(t.sent.filter((s) => s.data?.type === 'REMINDER_DAILY_PLAN')).toEqual([]);
  });

  it('is off when the switch is off', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z', config: { ...CONFIG, REMINDERS_ENABLED: 'false' } });
    const run = await t.reminders.run();
    expect(run.enabled).toBe(false);
    expect(t.sent).toEqual([]);
  });

  it('stays quiet in a closed financial year', async () => {
    const t = setup({ now: '2026-10-15T02:40:00Z', config: { ...CONFIG, FY_CLOSED_YEARS: '2026' } });
    await t.reminders.run();
    expect(t.sent.filter((s) => s.data?.type === 'REMINDER_DAILY_PLAN')).toEqual([]);
  });
});

describe('monthly deadlines', () => {
  it('reminds three days before the monthly plan deadline, to employees and managers', async () => {
    // Deadline 28 Oct; 3 days before = 25 Oct at 10:30 IST = 05:00Z. Plan month = November.
    const t = setup({ now: '2026-10-25T05:10:00Z' });
    t.state.monthlyStatus = { a: 'SUBMITTED' };
    await t.reminders.run();
    const employee = t.sent.find((s) => s.data?.type === 'REMINDER_MONTHLY_PLAN' && s.data.stage === 'due');
    expect(employee?.to.sort()).toEqual(['b', 'c', 'm']);
    expect(employee?.title).toBe('Send the plan for November 2026');
    expect(employee?.body).toContain('28 Oct');
    expect(employee?.body).toContain('in 3 days');
    const manager = t.sent.find((s) => s.data?.type === 'REMINDER_MONTHLY_PLAN' && s.data.stage === 'team-due');
    expect(manager?.body).toContain('2 of 3');
  });

  it('reminds about expenses before the cutoff and again the morning after', async () => {
    // September expenses are due 7 Oct; 1 day before = 6 Oct 10:30 IST.
    const t = setup({ now: '2026-10-06T05:10:00Z' });
    t.state.unsubmittedExpenses = ['a', 'b'];
    await t.reminders.run();
    const employee = t.sent.find((s) => s.data?.type === 'REMINDER_EXPENSE_SUBMIT');
    expect(employee?.to.sort()).toEqual(['a', 'b']);
    expect(employee?.title).toBe('Send September 2026 expenses');
    expect(employee?.body).toContain('tomorrow');
    t.setNow('2026-10-08T05:10:00Z');
    await t.reminders.run();
    expect(t.sent.some((s) => s.data?.type === 'REMINDER_EXPENSE_SUBMIT' && s.title === 'Missed: September 2026 expenses')).toBe(true);
  });

  it('tells managers how many expense months wait for approval before the approval cutoff', async () => {
    // Approval cutoff is the 10th; one day before = 9 Oct 10:30 IST.
    const t = setup({ now: '2026-10-09T05:10:00Z' });
    t.state.waiting = [
      { kind: 'EXPENSE_MONTH', managerId: 'm' },
      { kind: 'EXPENSE_MONTH', managerId: 'm' },
      { kind: 'LEAVE', managerId: 'm' },
    ];
    await t.reminders.run();
    const note = t.sent.find((s) => s.data?.type === 'REMINDER_EXPENSE_APPROVAL');
    expect(note?.to).toEqual(['m']);
    expect(note?.title).toBe('2 expense months to approve');
  });

  it('reminds employees with uncounted stock, and not their managers', async () => {
    const t = setup({ now: '2026-10-04T05:10:00Z' }); // 1 day before the 5th
    t.state.missingStock = ['b'];
    await t.reminders.run();
    const stock = t.sent.filter((s) => s.data?.type === 'REMINDER_STOCK');
    expect(stock).toHaveLength(1);
    expect(stock[0]?.to).toEqual(['b']);
  });
});

describe('approvals digest', () => {
  it('counts what waits for each manager, by kind, at the morning time', async () => {
    const t = setup({ now: '2026-10-15T05:15:00Z' }); // 10:45 IST
    t.state.waiting = [
      ...Array.from({ length: 3 }, () => ({ kind: 'DAILY_PLAN', managerId: 'm' })),
      { kind: 'MONTHLY_PLAN', managerId: 'm' },
      { kind: 'LEAVE', managerId: 'm' },
      { kind: 'LEAVE', managerId: 'm' },
      { kind: 'DAILY_PLAN', managerId: 'other' },
    ];
    await t.reminders.run();
    const digest = t.sent.find((s) => s.data?.type === 'REMINDER_APPROVALS_DIGEST' && s.to[0] === 'm');
    expect(digest?.title).toBe('6 requests waiting for you');
    expect(digest?.body).toBe('3 daily plans, 1 monthly plan and 2 leave requests are waiting for your approval. Open Team → Approvals.');
  });

  it('sends once per digest time and nothing when nothing waits', async () => {
    const t = setup({ now: '2026-10-15T05:15:00Z' });
    await t.reminders.run();
    expect(t.sent.filter((s) => s.data?.type === 'REMINDER_APPROVALS_DIGEST')).toEqual([]);
    t.state.waiting = [{ kind: 'LEAVE', managerId: 'm' }];
    await t.reminders.run(); // the morning slot was already claimed by the first run
    expect(t.sent.filter((s) => s.data?.type === 'REMINDER_APPROVALS_DIGEST')).toEqual([]);
    t.setNow('2026-10-15T11:45:00Z'); // 17:15 IST
    await t.reminders.run();
    expect(t.sent.filter((s) => s.data?.type === 'REMINDER_APPROVALS_DIGEST')).toHaveLength(1);
  });
});
