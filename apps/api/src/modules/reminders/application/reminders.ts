import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { parseBoolean, parsePositiveInt, readBusinessDay, readConfig, readConfigOr } from '@/shared/config/readConfig.js';
import { businessDate, dailyPlanDeadline, endOfBusinessDay, expenseMonthDeadline, monthlyPlanDeadline, parseCalendarDate, parseTimeOfDay, zonedInstant } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import { addMonths, clampedDate, monthName, monthOf, shortDate } from '../domain/months.js';
import type { ApprovalsPort, CalendarPort, ConfigReader, ExpensesPort, FieldPerson, InboxPort, PeoplePort, PlansPort, ReminderMarksPort, StockPort } from '../domain/ports.js';
import { dailyStages, dueStages, periodStages, type Audience, type Stage } from '../domain/stages.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lookups per person (leave, holidays, block) run this many at a time, so a stage over hundreds of people is not one long queue. */
const BATCH = 25;
/** A plan or expense is "sent" once it has left the employee's hands. */
const SENT = new Set(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']);

/** The screens a tap opens. Documented in docs/mobile/notifications.md; the phone maps them. */
export const ROUTES = {
  DAILY_PLAN: '/plan/daily',
  MONTHLY_PLAN: '/plan/monthly',
  EXPENSE_SUBMIT: '/expenses',
  EXPENSE_APPROVAL: '/team/approvals',
  STOCK: '/stock',
  APPROVALS: '/team/approvals',
} as const;

export interface ReminderRun {
  enabled: boolean;
  /** Stages that fired, as `TYPE:period:stage`. */
  fired: string[];
  employeesReminded: number;
  managersTold: number;
}

interface Context {
  now: Date;
  timeZone: string;
  dayStart: string;
  today: string;
  sendTime: string;
}

interface Track {
  type: string;
  period: string;
  stages: Stage[];
  /** What the message talks about: "today’s daily plan", "the plan for December 2026". */
  what: string;
  /** When it is due, in words: "10:00", "28 Nov". */
  dueText: string;
  route: string;
  /** What a late employee does next. */
  lateHint: string;
  expiresAt: Date;
  /** The people who could be asked, after the skip rules. */
  eligible: () => Promise<FieldPerson[]>;
  /** Of those, who has not done it. */
  pending: (people: FieldPerson[]) => Promise<string[]>;
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Deadline reminders and manager digests (docs/LLD/notifications.md). An interval job calls `run()` every few minutes; each reminder
 * stage fires once, whichever server gets there first (`ReminderMarksPort`), so running it often costs only a handful of cheap
 * claims. Everything goes through the Inbox, which also pushes to the phone.
 *
 * Skips, for the employee reminders: inactive people (never listed), those not yet joined, blocked, on leave, and on a weekly off or
 * holiday (daily plan only). Never changes anything; a failed track is logged and the others still run.
 */
export class Reminders {
  constructor(
    private readonly people: PeoplePort,
    private readonly calendar: CalendarPort,
    private readonly plans: PlansPort,
    private readonly expenses: ExpensesPort,
    private readonly stock: StockPort,
    private readonly approvals: ApprovalsPort,
    private readonly inbox: InboxPort,
    private readonly marks: ReminderMarksPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<ReminderRun> {
    const run: ReminderRun = { enabled: await readConfigOr(this.config, 'REMINDERS_ENABLED', parseBoolean, true), fired: [], employeesReminded: 0, managersTold: 0 };
    if (!run.enabled) return run;

    const ctx = await this.context();
    for (const make of [() => this.dailyPlanTrack(ctx), () => this.monthlyPlanTracks(ctx), () => this.expenseTracks(ctx), () => this.stockTrack(ctx)]) {
      try {
        for (const track of await make().then((t) => (Array.isArray(t) ? t : t ? [t] : []))) {
          try {
            await this.runTrack(track, ctx, run);
          } catch (err) {
            logger.error({ err, track: `${track.type}:${track.period}` }, 'reminder track failed');
          }
        }
      } catch (err) {
        logger.error({ err }, 'reminder tracks could not be built');
      }
    }
    try {
      await this.expenseApprovalDigest(ctx, run);
      await this.approvalsDigest(ctx, run);
    } catch (err) {
      logger.error({ err }, 'manager digest failed');
    }
    return run;
  }

  // ── Tracks ──────────────────────────────────────────────────────────────

  private async context(): Promise<Context> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const now = this.now();
    // The day-based reminders go out at the morning digest time.
    const sendTime = await readConfigOr(this.config, 'REMINDER_DIGEST_MORNING_TIME', (v) => (parseTimeOfDay(v), v), '10:30');
    return { now, timeZone, dayStart, today: businessDate(now, timeZone, dayStart), sendTime };
  }

  private async open(date: string): Promise<boolean> {
    try {
      await assertFinancialYearOpen(this.config, date, 'a reminder');
      return true;
    } catch (err) {
      // Only a closed year is a reason to stay quiet; anything else (a missing setting) must surface in the log.
      if (err instanceof AppError && (err.details as { code?: string } | undefined)?.code === 'FY_CLOSED') return false;
      throw err;
    }
  }

  private async dailyPlanTrack(ctx: Context): Promise<Track | null> {
    if (!(await this.open(ctx.today))) return null;
    const cutoff = await readConfig(this.config, 'DAILY_PLAN_SUBMIT_CUTOFF_TIME', (v) => (parseTimeOfDay(v), v));
    const deadline = dailyPlanDeadline(ctx.today, cutoff, ctx.timeZone);
    const stages = dailyStages(deadline, {
      firstMinutes: await readConfigOr(this.config, 'REMINDER_DAILY_FIRST_MINUTES', parsePositiveInt(720), 120),
      secondMinutes: await readConfigOr(this.config, 'REMINDER_DAILY_SECOND_MINUTES', parsePositiveInt(720), 30),
      afterMinutes: await readConfigOr(this.config, 'REMINDER_DAILY_AFTER_MINUTES', parsePositiveInt(720), 30),
    });
    return {
      type: 'DAILY_PLAN',
      period: ctx.today,
      stages,
      what: 'today’s daily plan',
      dueText: cutoff,
      route: ROUTES.DAILY_PLAN,
      lateHint: 'Ask your manager for a late-submission exception.',
      expiresAt: endOfBusinessDay(ctx.today, ctx.dayStart, ctx.timeZone),
      eligible: () => this.workingToday(ctx),
      pending: async (people) => this.withoutSent(people, (id) => this.plans.getDailyPlanStatus(id, ctx.today)),
    };
  }

  private async monthlyPlanTracks(ctx: Context): Promise<Track[]> {
    const cutoffDay = await readConfig(this.config, 'MONTHLY_PLAN_SUBMIT_CUTOFF_DATE', parsePositiveInt(31));
    const offsets = await this.periodOffsets(ctx);
    const current = monthOf(ctx.today);
    const tracks: Track[] = [];
    // The plan for next month is due in this one; for a few hours after month end the "missed" stage belongs to the month that just began.
    for (const planMonth of [addMonths(current, 1), current]) {
      const deadlineDate = clampedDate(addMonths(planMonth, -1), cutoffDay);
      if (!(await this.open(`${planMonth}-01`))) continue;
      const deadline = monthlyPlanDeadline(planMonth, cutoffDay, ctx.timeZone, ctx.dayStart);
      tracks.push({
        type: 'MONTHLY_PLAN',
        period: planMonth,
        stages: periodStages(deadlineDate, deadline, offsets, ctx.timeZone),
        what: `the plan for ${monthName(planMonth)}`,
        dueText: shortDate(deadlineDate),
        route: ROUTES.MONTHLY_PLAN,
        lateHint: 'Ask your manager for a late-submission exception.',
        expiresAt: new Date(ctx.now.getTime() + 3 * DAY_MS),
        eligible: () => this.joined(ctx),
        pending: async (people) => this.withoutSent(people, (id) => this.plans.getMonthlyPlanStatus(id, planMonth)),
      });
    }
    return tracks;
  }

  private async expenseTracks(ctx: Context): Promise<Track[]> {
    const cutoffDay = await readConfig(this.config, 'EXPENSE_SUBMIT_CUTOFF_DAY', parsePositiveInt(31));
    const month = addMonths(monthOf(ctx.today), -1);
    if (!(await this.open(`${month}-01`))) return [];
    const deadlineDate = clampedDate(addMonths(month, 1), cutoffDay);
    return [
      {
        type: 'EXPENSE_SUBMIT',
        period: month,
        stages: periodStages(deadlineDate, expenseMonthDeadline(month, cutoffDay, ctx.timeZone, ctx.dayStart), await this.periodOffsets(ctx), ctx.timeZone),
        what: `${monthName(month)} expenses`,
        dueText: shortDate(deadlineDate),
        route: ROUTES.EXPENSE_SUBMIT,
        lateHint: 'Ask your manager or Admin for a late-submission exception.',
        expiresAt: new Date(ctx.now.getTime() + 3 * DAY_MS),
        eligible: () => this.joined(ctx),
        pending: async (people) => this.expenses.listUnsubmittedExpenseUsers(month, people.map((p) => p.id)),
      },
    ];
  }

  private async stockTrack(ctx: Context): Promise<Track | null> {
    const day = await readConfig(this.config, 'MONTHLY_STOCK_DEADLINE_DAY', parsePositiveInt(31));
    const month = addMonths(monthOf(ctx.today), -1);
    if (!(await this.open(`${month}-01`))) return null;
    const deadlineDate = clampedDate(addMonths(month, 1), day);
    return {
      type: 'STOCK',
      period: month,
      // Employees only: the stock count is theirs; the manager's view is the Team stock report.
      stages: periodStages(deadlineDate, expenseMonthDeadline(month, day, ctx.timeZone, ctx.dayStart), await this.periodOffsets(ctx), ctx.timeZone, ['EMPLOYEE']),
      what: `${monthName(month)} stock counts`,
      dueText: shortDate(deadlineDate),
      route: ROUTES.STOCK,
      lateHint: 'Ask Admin to open the month.',
      expiresAt: new Date(ctx.now.getTime() + 3 * DAY_MS),
      eligible: () => this.joined(ctx),
      pending: async (people) => (await this.stock.listMissingStock(month, people.map((p) => p.id))).map((r) => r.userId),
    };
  }

  private async periodOffsets(ctx: Context) {
    return {
      firstDays: await readConfigOr(this.config, 'REMINDER_MONTHLY_FIRST_DAYS', parsePositiveInt(14), 3),
      secondDays: await readConfigOr(this.config, 'REMINDER_MONTHLY_SECOND_DAYS', parsePositiveInt(14), 1),
      sendTime: ctx.sendTime,
    };
  }

  // ── Who is asked ────────────────────────────────────────────────────────

  private async everyone(): Promise<FieldPerson[]> {
    return this.people.listFieldEmployees();
  }

  /** Joined by today and not blocked. */
  private async joined(ctx: Context): Promise<FieldPerson[]> {
    return this.filterEach(await this.everyone(), async (p) => {
      const joined = (await this.people.getEmploymentDetails(p.id))?.dateOfJoining;
      if (joined && businessDate(joined, ctx.timeZone, ctx.dayStart) > ctx.today) return false;
      return !(await this.people.isBlocked(p.id));
    });
  }

  /** `joined`, and today is a working day for them: not a weekly off, a holiday or an approved leave. */
  private async workingToday(ctx: Context): Promise<FieldPerson[]> {
    const people = await this.joined(ctx);
    return this.filterEach(people, async (p) => {
      const [off, leave] = await Promise.all([this.calendar.listOffDates(p.id, ctx.today, ctx.today), this.calendar.listLeaveDates(p.id, ctx.today, ctx.today)]);
      return off.length === 0 && leave.length === 0;
    });
  }

  private async filterEach<T>(items: T[], keep: (item: T) => Promise<boolean>): Promise<T[]> {
    const out: T[] = [];
    for (const group of chunk(items, BATCH)) {
      const kept = await Promise.all(group.map(async (item) => ((await keep(item)) ? item : null)));
      for (const item of kept) if (item) out.push(item);
    }
    return out;
  }

  private async withoutSent(people: FieldPerson[], statusOf: (id: string) => Promise<string | null>): Promise<string[]> {
    const rows = await this.filterEach(people, async (p) => {
      const status = await statusOf(p.id);
      return !(status && SENT.has(status));
    });
    return rows.map((p) => p.id);
  }

  // ── Firing a track ──────────────────────────────────────────────────────

  private key(track: Track, stage: Stage): string {
    return `rem:${track.type}:${track.period}:${stage.id}`;
  }

  private async runTrack(track: Track, ctx: Context, run: ReminderRun): Promise<void> {
    const due: Partial<Record<Audience, { send: Stage; all: Stage[] }>> = {};
    for (const audience of ['EMPLOYEE', 'MANAGER'] as const) {
      const found = dueStages(track.stages, audience, ctx.now);
      if (found) due[audience] = found;
    }
    const claimKeys = [...(due.EMPLOYEE?.all ?? []), ...(due.MANAGER?.all ?? [])].map((s) => this.key(track, s));
    if (claimKeys.length === 0) return;
    const fresh = new Set(await this.marks.claim(claimKeys));
    const fireEmployee = due.EMPLOYEE && fresh.has(this.key(track, due.EMPLOYEE.send)) ? due.EMPLOYEE.send : null;
    const fireManager = due.MANAGER && fresh.has(this.key(track, due.MANAGER.send)) ? due.MANAGER.send : null;
    if (!fireEmployee && !fireManager) return;

    const people = await track.eligible();
    const pending = new Set(await track.pending(people));

    if (fireEmployee) {
      run.fired.push(`${track.type}:${track.period}:${fireEmployee.id}`);
      const late = fireEmployee.phase === 'AFTER';
      const title = late ? `Missed: ${track.what}` : `Send ${track.what}`;
      const body = late ? `It was due ${track.dueText} and has not been sent. ${track.lateHint}` : `Due ${track.dueText} (${fireEmployee.when}). You haven’t sent it yet.`;
      if (pending.size > 0) run.employeesReminded += await this.inbox.notify([...pending], this.message(track, title, body, late ? 'missed' : 'due'));
    }
    if (fireManager) {
      run.fired.push(`${track.type}:${track.period}:${fireManager.id}`);
      run.managersTold += await this.tellManagers(track, fireManager, people, pending);
    }
  }

  private message(track: Track, title: string, body: string, stage: string) {
    return { title, body, kind: 'REMINDER' as const, expiresAt: track.expiresAt, data: { type: `REMINDER_${track.type}`, route: track.route, period: track.period, stage } };
  }

  /** Each manager hears how many of their whole team have not done it, and how many of those are direct reports. */
  private async tellManagers(track: Track, stage: Stage, people: FieldPerson[], pending: Set<string>): Promise<number> {
    const parent = new Map(people.map((p) => [p.id, p.managerId]));
    const all = new Map<string, FieldPerson[]>(); // eligible people below each manager
    const direct = new Map<string, number>(); // pending direct reports
    const pendingBelow = new Map<string, number>();
    for (const p of people) {
      let up = p.managerId;
      const seen = new Set<string>();
      while (up && !seen.has(up)) {
        seen.add(up);
        all.set(up, [...(all.get(up) ?? []), p]);
        if (pending.has(p.id)) {
          pendingBelow.set(up, (pendingBelow.get(up) ?? 0) + 1);
          if (up === p.managerId) direct.set(up, (direct.get(up) ?? 0) + 1);
        }
        up = parent.get(up) ?? null;
      }
    }
    let told = 0;
    for (const [managerId, count] of pendingBelow) {
      const size = all.get(managerId)?.length ?? count;
      const late = stage.phase === 'AFTER';
      const directText = (direct.get(managerId) ?? 0) > 0 && (direct.get(managerId) ?? 0) !== count ? ` (${direct.get(managerId)} direct)` : '';
      const title = late ? `${plural(count, 'person', 'people')} missed ${track.what}` : `${count} of your team haven’t sent ${track.what}`;
      const body = late
        ? `${count} of ${size} on your team${directText} missed the ${track.dueText} deadline for ${track.what}. Open Team to see who.`
        : `${count} of ${size} on your team${directText} haven’t sent ${track.what}. Due ${track.dueText} (${stage.when}).`;
      told += await this.inbox.notify([managerId], this.message(track, title, body, late ? 'team-missed' : 'team-due'));
    }
    return told;
  }

  // ── Digests (managers) ──────────────────────────────────────────────────

  /** Expense approval cutoff: the manager's waiting months, three days before, one day before and after it. */
  private async expenseApprovalDigest(ctx: Context, run: ReminderRun): Promise<void> {
    const cutoffDay = await readConfig(this.config, 'EXPENSE_APPROVAL_CUTOFF_DAY', parsePositiveInt(31));
    const month = addMonths(monthOf(ctx.today), -1);
    if (!(await this.open(`${month}-01`))) return;
    const deadlineDate = clampedDate(addMonths(month, 1), cutoffDay);
    const track: Track = {
      type: 'EXPENSE_APPROVAL',
      period: month,
      stages: periodStages(deadlineDate, expenseMonthDeadline(month, cutoffDay, ctx.timeZone, ctx.dayStart), await this.periodOffsets(ctx), ctx.timeZone, ['MANAGER']),
      what: `${monthName(month)} expenses`,
      dueText: shortDate(deadlineDate),
      route: ROUTES.EXPENSE_APPROVAL,
      lateHint: '',
      expiresAt: new Date(ctx.now.getTime() + 3 * DAY_MS),
      eligible: async () => [],
      pending: async () => [],
    };
    const found = dueStages(track.stages, 'MANAGER', ctx.now);
    if (!found) return;
    const fresh = await this.marks.claim(found.all.map((s) => this.key(track, s)));
    if (!fresh.includes(this.key(track, found.send))) return;

    const waiting = await this.approvals.listWaitingOnManagers({ kinds: ['EXPENSE_MONTH'] });
    const perManager = new Map<string, number>();
    for (const r of waiting) perManager.set(r.managerId, (perManager.get(r.managerId) ?? 0) + 1);
    run.fired.push(`EXPENSE_APPROVAL:${month}:${found.send.id}`);
    const late = found.send.phase === 'AFTER';
    for (const [managerId, count] of perManager) {
      const title = late ? `${plural(count, 'expense month')} still waiting` : `${plural(count, 'expense month')} to approve`;
      const body = late
        ? `The ${track.dueText} approval deadline for ${track.what} has passed and ${count} still wait for you. Only Admin can approve them now.`
        : `${count} of your team’s ${track.what} wait for your approval. Deadline ${track.dueText} (${found.send.when}).`;
      run.managersTold += await this.inbox.notify([managerId], this.message(track, title, body, late ? 'approval-missed' : 'approval-due'));
    }
  }

  /** "100 daily plans, 10 monthly plans, 5 expenses and 3 leaves are waiting", at the two digest times. Nothing waiting, nothing sent. */
  private async approvalsDigest(ctx: Context, run: ReminderRun): Promise<void> {
    const times = [
      { id: 'morning', time: await readConfigOr(this.config, 'REMINDER_DIGEST_MORNING_TIME', (v) => (parseTimeOfDay(v), v), '10:30') },
      { id: 'evening', time: await readConfigOr(this.config, 'REMINDER_DIGEST_EVENING_TIME', (v) => (parseTimeOfDay(v), v), '17:00') },
    ];
    const due = times
      .map((t) => {
        const { hour, minute } = parseTimeOfDay(t.time);
        const at = zonedInstant(parseCalendarDate(ctx.today), hour, minute, ctx.timeZone);
        return { id: t.id, at, until: new Date(at.getTime() + 3 * 60 * 60 * 1000) };
      })
      .filter((t) => t.at <= ctx.now && ctx.now < t.until);
    const current = due[due.length - 1];
    if (!current) return;
    const fresh = await this.marks.claim(due.map((t) => `rem:DIGEST:${ctx.today}:${t.id}`));
    if (!fresh.includes(`rem:DIGEST:${ctx.today}:${current.id}`)) return;

    const waiting = await this.approvals.listWaitingOnManagers();
    const perManager = new Map<string, Map<string, number>>();
    for (const r of waiting) {
      const kinds = perManager.get(r.managerId) ?? new Map<string, number>();
      kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
      perManager.set(r.managerId, kinds);
    }
    run.fired.push(`DIGEST:${ctx.today}:${current.id}`);
    for (const [managerId, kinds] of perManager) {
      const total = [...kinds.values()].reduce((a, b) => a + b, 0);
      const parts = DIGEST_ORDER.filter(([kind]) => kinds.has(kind)).map(([kind, one, many]) => plural(kinds.get(kind) ?? 0, one, many));
      const other = total - DIGEST_ORDER.reduce((a, [kind]) => a + (kinds.get(kind) ?? 0), 0);
      if (other > 0) parts.push(plural(other, 'other request'));
      run.managersTold += await this.inbox.notify([managerId], {
        title: `${plural(total, 'request')} waiting for you`,
        body: `${list(parts)} ${total === 1 ? 'is' : 'are'} waiting for your approval. Open Team → Approvals.`,
        kind: 'REMINDER',
        expiresAt: new Date(ctx.now.getTime() + DAY_MS),
        data: { type: 'REMINDER_APPROVALS_DIGEST', route: ROUTES.APPROVALS, period: ctx.today, stage: current.id },
      });
    }
  }
}

const DIGEST_ORDER: Array<[string, string, string]> = [
  ['DAILY_PLAN', 'daily plan', 'daily plans'],
  ['MONTHLY_PLAN', 'monthly plan', 'monthly plans'],
  ['EXPENSE_MONTH', 'expense month', 'expense months'],
  ['LEAVE', 'leave request', 'leave requests'],
  ['DCR', 'daily report', 'daily reports'],
  ['SECONDARY_SALES', 'secondary-sales month', 'secondary-sales months'],
  ['NEW_DOCTOR', 'new doctor', 'new doctors'],
  ['DOCTOR_SERVICE', 'doctor service', 'doctor services'],
];

const list = (parts: string[]): string => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
