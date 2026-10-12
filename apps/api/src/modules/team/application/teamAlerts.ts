import { parseBoolean, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import type {
  AlertMarksPort,
  TeamApprovalPort,
  TeamInboxPort,
  TeamPeoplePort,
  WaitingRequest,
} from '../domain/ports.js';

export const ALERTS_ENABLED_KEY = 'TEAM_ALERTS_ENABLED';

/**
 * Kinds a manager hears about the moment they arrive (sign-off F8, answered 2026-10-12): the rare, weighty ones. Daily and monthly plans and
 * daily reports are many a day, so they stay with the badge on the Team screen. Overdue reminders cover every kind.
 */
export const NEW_REQUEST_KINDS = ['LEAVE', 'EXPENSE_MONTH', 'NEW_DOCTOR'] as const;
/** A request older than this is not announced as new (it is the overdue reminder's business, or the badge's). */
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 14 * DAY_MS;
const LISTED = 8;

const LABEL: Record<string, string> = {
  LEAVE: 'a leave request',
  EXPENSE_MONTH: 'monthly expenses',
  NEW_DOCTOR: 'a new doctor',
  DAILY_PLAN: 'a daily plan',
  MONTHLY_PLAN: 'a monthly plan',
  DCR: 'a daily report',
  SECONDARY_SALES: 'monthly secondary sales',
  DOCTOR_SERVICE: 'a doctor service',
};
const label = (kind: string): string => LABEL[kind] ?? 'a request';

export interface AlertRun {
  enabled: boolean;
  newRequests: number;
  overdue: number;
  managersNotified: number;
}

const group = <T>(items: T[], by: (t: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const i of items) out.set(by(i), [...(out.get(by(i)) ?? []), i]);
  return out;
};

/**
 * What the manager is told, in their Inbox (no push yet): a new leave, monthly-expenses or new-doctor request; a request waiting past the
 * approval turnaround; a team member the system has blocked. One message per manager per run, listing the people, so a busy day is not a
 * flood. Each request is announced once (`AlertMarksPort`), whichever server runs the job. Never approves or escalates anything.
 */
export class TeamAlerts {
  constructor(
    private readonly approvals: TeamApprovalPort,
    private readonly people: TeamPeoplePort,
    private readonly inbox: TeamInboxPort,
    private readonly marks: AlertMarksPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private enabled(): Promise<boolean> {
    return readConfigOr(this.config, ALERTS_ENABLED_KEY, parseBoolean, true);
  }

  /** New and overdue requests. Meant to run every few minutes. */
  async runWaiting(): Promise<AlertRun> {
    const run: AlertRun = {
      enabled: await this.enabled(),
      newRequests: 0,
      overdue: 0,
      managersNotified: 0,
    };
    if (!run.enabled) return run;

    const now = this.now();
    const waiting = await this.approvals.listWaitingOnManagers();
    const fresh = waiting.filter(
      (r) =>
        (NEW_REQUEST_KINDS as readonly string[]).includes(r.kind) &&
        now.getTime() - r.submittedAt.getTime() <= NEW_WINDOW_MS,
    );
    const late = waiting.filter((r) => r.overdue);
    const newKeys = new Set(
      await this.marks.claim(fresh.map((r) => `new:${r.requestId}:${r.cycle}`)),
    );
    const lateKeys = new Set(
      await this.marks.claim(late.map((r) => `overdue:${r.requestId}:${r.cycle}`)),
    );
    const newOnes = fresh.filter((r) => newKeys.has(`new:${r.requestId}:${r.cycle}`));
    const lateOnes = late.filter((r) => lateKeys.has(`overdue:${r.requestId}:${r.cycle}`));
    run.newRequests = newOnes.length;
    run.overdue = lateOnes.length;
    if (newOnes.length === 0 && lateOnes.length === 0) return run;

    const names = new Map(
      (
        await this.people.getUserSummaries([
          ...new Set([...newOnes, ...lateOnes].map((r) => r.submitterId)),
        ])
      ).map((p) => [p.id, p.name]),
    );
    const nameOf = (r: WaitingRequest) => names.get(r.submitterId) ?? 'Someone';
    const reached = new Set<string>();
    const expiresAt = new Date(now.getTime() + KEEP_MS);

    for (const [managerId, rows] of group(newOnes, (r) => r.managerId)) {
      const lines = rows.map((r) => `• ${nameOf(r)} sent ${label(r.kind)}`);
      const title =
        rows.length === 1
          ? `${nameOf(rows[0] as WaitingRequest)} sent ${label((rows[0] as WaitingRequest).kind)}`
          : `${rows.length} new requests from your team`;
      const body = `${list(lines)}\n\nOpen Team → Approvals to decide.`;
      if ((await this.inbox.notify([managerId], { title, body, kind: 'UPDATE', expiresAt })) > 0)
        reached.add(managerId);
    }
    for (const [managerId, rows] of group(lateOnes, (r) => r.managerId)) {
      const lines = rows.map(
        (r) =>
          `• ${nameOf(r)} — ${label(r.kind)}, waiting ${Math.max(1, Math.floor((now.getTime() - r.submittedAt.getTime()) / DAY_MS))} days`,
      );
      const title =
        rows.length === 1
          ? 'A request is waiting too long'
          : `${rows.length} requests are waiting too long`;
      const body = `${list(lines)}\n\nNothing is approved automatically. Open Team → Approvals to decide.`;
      if ((await this.inbox.notify([managerId], { title, body, kind: 'REMINDER', expiresAt })) > 0)
        reached.add(managerId);
    }
    run.managersNotified = reached.size;
    return run;
  }

  /** Tells each blocked person's manager. Pass only people newly blocked (the missed-DCR job returns exactly those). */
  async notifyBlocked(blocked: Array<{ userId: string; missedDates: string[] }>): Promise<number> {
    if (blocked.length === 0 || !(await this.enabled())) return 0;
    const people = await this.people.getUserSummaries(blocked.map((b) => b.userId));
    const personOf = new Map(people.map((p) => [p.id, p]));
    const expiresAt = new Date(this.now().getTime() + KEEP_MS);
    let reached = 0;
    for (const [managerId, rows] of group(
      blocked.filter((b) => personOf.get(b.userId)?.managerId),
      (b) => personOf.get(b.userId)?.managerId as string,
    )) {
      const lines = rows.map(
        (b) =>
          `• ${personOf.get(b.userId)?.name ?? 'Someone'} — no report for ${b.missedDates.join(', ')}`,
      );
      const title =
        rows.length === 1
          ? `${personOf.get((rows[0] as { userId: string }).userId)?.name ?? 'Someone'} is blocked`
          : `${rows.length} of your team are blocked`;
      const body = `${list(lines)}\n\nThey cannot submit anything until unblocked. Open Team → the person → Unblock (give a reason).`;
      if ((await this.inbox.notify([managerId], { title, body, kind: 'UPDATE', expiresAt })) > 0)
        reached += 1;
    }
    return reached;
  }
}

const list = (lines: string[]): string =>
  lines.length <= LISTED
    ? lines.join('\n')
    : `${lines.slice(0, LISTED).join('\n')}\n…and ${lines.length - LISTED} more`;
