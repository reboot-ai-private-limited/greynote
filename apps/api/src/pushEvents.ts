import { appEvents } from '@/shared/events/appEvents.js';
import { logger } from '@/shared/logging/logger.js';
import { readBusinessDay, type ConfigReader } from '@/shared/config/readConfig.js';
import type { InboxPublicContract } from '@/modules/inbox/inbox.public.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What the person is told the request was, and the screen a tap opens (docs/mobile/notifications.md). */
const KINDS: Record<string, { label: string; route: string }> = {
  DAILY_PLAN: { label: 'daily plan', route: '/plan/daily' },
  MONTHLY_PLAN: { label: 'monthly plan', route: '/plan/monthly' },
  LEAVE: { label: 'leave request', route: '/leave' },
  DCR: { label: 'daily report', route: '/dcr' },
  EXPENSE_MONTH: { label: 'monthly expenses', route: '/expenses' },
  SECONDARY_SALES: { label: 'secondary sales', route: '/secondary' },
  NEW_DOCTOR: { label: 'new doctor', route: '/doctors' },
  DOCTOR_SERVICE: { label: 'doctor service', route: '/services' },
};

const GRANT_WHAT = { DAILY_PLAN: 'today’s daily plan', MONTHLY_PLAN: 'the monthly plan', EXPENSE_MONTH: 'the monthly expenses' } as const;

const monthName = (month: string): string =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * Immediate messages (as opposed to the scheduled reminders): the answer to something the employee sent, an exception that lets them
 * submit late, an unblock. Each becomes an Inbox message, which the Inbox also pushes. Registered once, at composition.
 */
export function registerPushEvents(inbox: InboxPublicContract, config: ConfigReader): void {
  appEvents.clear(); // composition can run more than once in one process (tests); never register twice

  const send = (userId: string, title: string, body: string, data: Record<string, string>) =>
    inbox.notify([userId], { title, body, kind: 'UPDATE', expiresAt: new Date(Date.now() + WEEK_MS), data });

  appEvents.on('approval.decided', async (e) => {
    const kind = KINDS[e.kind] ?? { label: 'request', route: '/inbox' };
    const approved = e.status === 'APPROVED';
    const reason = e.comment ? e.comment : approved ? '' : 'Open it to see why.';
    await send(e.submitterId, `Your ${kind.label} was ${approved ? 'approved' : 'rejected'}`, approved ? (reason || 'Nothing more to do.') : reason, {
      type: `DECISION_${e.kind}`,
      route: kind.route,
      recordId: e.recordId,
      status: e.status,
    });
  });

  appEvents.on('submit.exception.granted', async (e) => {
    const { timeZone } = await readBusinessDay(config);
    const until = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(e.expiresAt);
    await send(e.userId, 'You can send it late', `You may send ${GRANT_WHAT[e.kind]} until ${until}.`, {
      type: `LATE_GRANT_${e.kind}`,
      route: KINDS[e.kind === 'EXPENSE_MONTH' ? 'EXPENSE_MONTH' : e.kind]?.route ?? '/inbox',
      period: e.planKey,
    });
  });

  appEvents.on('monthly.plan.amended', async (e) => {
    await send(e.userId, 'Your tour plan was edited', `${e.byName} edited your plan for ${monthName(e.planMonth)}: ${e.reason}`, {
      type: 'PLAN_AMENDED_MONTHLY_PLAN',
      route: KINDS.MONTHLY_PLAN?.route ?? '/inbox',
      recordId: e.planId,
      period: e.planMonth,
    });
  });

  appEvents.on('user.unblocked', async (e) => {
    await send(e.userId, 'You can submit again', 'Your account was unblocked. Send the reports you owe.', { type: 'UNBLOCKED', route: '/dcr' });
  });

  logger.debug('push events registered');
}
