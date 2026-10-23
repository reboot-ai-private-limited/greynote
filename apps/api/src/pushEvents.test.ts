import { afterEach, describe, expect, it } from 'vitest';
import { appEvents } from '@/shared/events/appEvents.js';
import { registerPushEvents } from './pushEvents.js';

const sent: Array<{ to: string[]; title: string; body: string; data?: Record<string, string> | undefined }> = [];
const inbox = { notify: async (to: string[], i: { title: string; body: string; data?: Record<string, string> | undefined }) => (sent.push({ to, ...i }), to.length) };
const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00' })[key] as string };
const settle = () => new Promise((r) => setTimeout(r, 5));

afterEach(() => {
  sent.length = 0;
  appEvents.clear();
});

describe('immediate push events', () => {
  it('tells the submitter a rejection and why', async () => {
    registerPushEvents(inbox as never, config);
    appEvents.emit('approval.decided', { kind: 'DAILY_PLAN', recordId: 'p1', submitterId: 'u1', status: 'REJECTED', comment: 'Add the Kalyani route', actorId: 'm1', auto: false });
    await settle();
    expect(sent).toEqual([{ to: ['u1'], title: 'Your daily plan was rejected', body: 'Add the Kalyani route', kind: 'UPDATE', expiresAt: expect.any(Date), data: { type: 'DECISION_DAILY_PLAN', route: '/plan/daily', recordId: 'p1', status: 'REJECTED' } }].map((e) => expect.objectContaining(e)));
  });

  it('tells the submitter an approval', async () => {
    registerPushEvents(inbox as never, config);
    appEvents.emit('approval.decided', { kind: 'LEAVE', recordId: 'l1', submitterId: 'u1', status: 'APPROVED', comment: null, actorId: 'hr', auto: false });
    await settle();
    expect(sent[0]?.title).toBe('Your leave request was approved');
  });

  it('says until when a late exception lasts, in business time', async () => {
    registerPushEvents(inbox as never, config);
    appEvents.emit('submit.exception.granted', { userId: 'u1', kind: 'DAILY_PLAN', planKey: '2026-10-15', expiresAt: new Date('2026-10-15T12:30:00Z'), grantedBy: 'm1' });
    await settle();
    expect(sent[0]?.title).toBe('You can send it late');
    expect(sent[0]?.body).toBe('You may send today’s daily plan until 15 Oct, 18:00.');
  });

  it('tells an unblocked employee', async () => {
    registerPushEvents(inbox as never, config);
    appEvents.emit('user.unblocked', { userId: 'u1', by: 'a' });
    await settle();
    expect(sent[0]?.to).toEqual(['u1']);
  });

  it('tells the employee who edited their monthly plan and why', async () => {
    registerPushEvents(inbox as never, config);
    appEvents.emit('monthly.plan.amended', { userId: 'u1', planId: 'p1', planMonth: '2026-11', by: 'm1', byName: 'Asha Rao', reason: 'Cover Kalyani' });
    await settle();
    expect(sent[0]).toMatchObject({
      to: ['u1'],
      title: 'Your tour plan was edited',
      body: 'Asha Rao edited your plan for November 2026: Cover Kalyani',
      data: { type: 'PLAN_AMENDED_MONTHLY_PLAN', route: '/plan/monthly', recordId: 'p1', period: '2026-11' },
    });
  });

  it('registering twice does not double the messages', async () => {
    registerPushEvents(inbox as never, config);
    registerPushEvents(inbox as never, config);
    appEvents.emit('user.unblocked', { userId: 'u1', by: 'a' });
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('a failing listener never reaches the announcer', async () => {
    appEvents.on('user.unblocked', async () => {
      throw new Error('boom');
    });
    expect(() => appEvents.emit('user.unblocked', { userId: 'u1', by: 'a' })).not.toThrow();
    await settle();
  });
});
