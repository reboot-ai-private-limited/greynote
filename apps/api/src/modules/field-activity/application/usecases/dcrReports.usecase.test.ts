import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { DcrClock } from '../dcrClock.js';
import { FakeApprovals, FakeChemistCalls, FakeConfig, FakeDcrs, FakeDoctorCalls, FakeFollowups } from './faTestKit.js';
import { ListCalledDoctorsUseCase, SummarizeDcrsUseCase } from './dcrReports.usecase.js';

type GeoStatus = 'PASS' | 'FAIL' | 'UNVERIFIED' | 'OVERRIDE';

function world() {
  const dcrs = new FakeDcrs();
  const approvals = new FakeApprovals();
  const doctor = new FakeDoctorCalls();
  const chemist = new FakeChemistCalls();
  const follow = new FakeFollowups();
  const clock = new DcrClock(new FakeConfig(), () => new Date('2026-10-20T06:00:00Z'));
  const summarize = new SummarizeDcrsUseCase(dcrs, approvals, doctor, chemist, follow, clock);
  const called = new ListCalledDoctorsUseCase(dcrs, approvals, doctor);

  /** A daily report with its approval request (`null` = still a draft), submitted at `submittedAt`. */
  const report = async (userId: string, reportDate: string, status: ApprovalRequest['status'] | null, submittedAt = `${reportDate}T10:00:00Z`) => {
    const dcr = await dcrs.getOrCreate(userId, reportDate);
    if (status) approvals.requests.set(`DCR:${dcr.id}`, { id: `req-${dcr.id}`, kind: 'DCR', recordId: dcr.id, submitterId: userId, status, workflow: 'MANAGER_THEN_FINAL', cycle: 1, submittedAt: new Date(submittedAt), decidedAt: null, history: [] });
    return dcr;
  };
  const doctorCall = (dcrId: string, userId: string, reportDate: string, doctorId: string, status: GeoStatus = 'PASS', notInPlan = false) => doctor.rows.push({ id: `dc-${doctor.rows.length}`, dcrId, userId, reportDate, doctorId, notInPlan, geofence: { status } } as never);
  const chemistCall = (dcrId: string, userId: string, reportDate: string, status: GeoStatus = 'PASS') => chemist.rows.push({ id: `cc-${chemist.rows.length}`, dcrId, userId, reportDate, geofence: { status } } as never);
  const followup = (dcrId: string, userId: string, reportDate: string) => follow.rows.push({ id: `fu-${follow.rows.length}`, dcrId, userId, reportDate } as never);
  return { report, doctorCall, chemistCall, followup, summarize, called };
}

const range = { from: '2026-10-01', to: '2026-10-31' };

describe('summarizing the daily reports', () => {
  it('counts reported days, calls, follow-ups and geofence results per employee and month', async () => {
    const w = world();
    const a = await w.report('u1', '2026-10-05', 'APPROVED');
    const b = await w.report('u1', '2026-10-06', 'SUBMITTED');
    w.doctorCall(a.id, 'u1', '2026-10-05', 'd1');
    w.doctorCall(a.id, 'u1', '2026-10-05', 'd2', 'FAIL');
    w.chemistCall(a.id, 'u1', '2026-10-05', 'UNVERIFIED');
    w.followup(a.id, 'u1', '2026-10-05');
    w.doctorCall(b.id, 'u1', '2026-10-06', 'd3', 'OVERRIDE', true);
    const [s] = await w.summarize.execute(range);
    expect(s).toEqual({ userId: 'u1', month: '2026-10', reportedDays: 2, lateDays: 0, doctorCalls: 3, chemistCalls: 1, followups: 1, geofence: { pass: 1, fail: 1, unverified: 1, override: 1 }, notInPlan: 1 });
  });

  it('leaves out a day that is only a draft, rejected or withdrawn, together with its calls', async () => {
    const w = world();
    const ok = await w.report('u1', '2026-10-05', 'MANAGER_APPROVED');
    for (const [day, status] of [['2026-10-06', null], ['2026-10-07', 'REJECTED'], ['2026-10-08', 'WITHDRAWN'], ['2026-10-09', 'REOPENED']] as const) {
      const d = await w.report('u1', day, status);
      w.doctorCall(d.id, 'u1', day, 'dx');
    }
    w.doctorCall(ok.id, 'u1', '2026-10-05', 'd1');
    const out = await w.summarize.execute(range);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reportedDays: 1, doctorCalls: 1 });
  });

  it('a day submitted after the day itself, in the business timezone, is late', async () => {
    const w = world();
    await w.report('u1', '2026-10-05', 'APPROVED', '2026-10-05T14:00:00Z'); // 19:30 IST the same day
    await w.report('u1', '2026-10-06', 'APPROVED', '2026-10-06T19:00:00Z'); // 00:30 IST the next day
    await w.report('u1', '2026-10-07', 'APPROVED', '2026-10-09T05:00:00Z'); // two days on
    expect((await w.summarize.execute(range))[0]).toMatchObject({ reportedDays: 3, lateDays: 2 });
  });

  it('keeps employees and months apart, and only looks at the range asked for', async () => {
    const w = world();
    await w.report('u1', '2026-09-30', 'APPROVED');
    await w.report('u1', '2026-10-01', 'APPROVED');
    await w.report('u2', '2026-10-01', 'APPROVED');
    const all = await w.summarize.execute({ from: '2026-09-01', to: '2026-10-31' });
    expect(all.map((s) => `${s.userId}|${s.month}`).sort()).toEqual(['u1|2026-09', 'u1|2026-10', 'u2|2026-10']);
    expect(await w.summarize.execute({ from: '2026-11-01', to: '2026-11-30' })).toEqual([]);
  });
});

describe('the doctors an employee called on', () => {
  it('are the distinct ones from reported days in the range, not from drafts or other people', async () => {
    const w = world();
    const a = await w.report('u1', '2026-10-05', 'APPROVED');
    const b = await w.report('u1', '2026-10-06', 'SUBMITTED');
    const draft = await w.report('u1', '2026-10-07', null);
    const other = await w.report('u2', '2026-10-05', 'APPROVED');
    w.doctorCall(a.id, 'u1', '2026-10-05', 'd1');
    w.doctorCall(b.id, 'u1', '2026-10-06', 'd1');
    w.doctorCall(b.id, 'u1', '2026-10-06', 'd2');
    w.doctorCall(draft.id, 'u1', '2026-10-07', 'd3');
    w.doctorCall(other.id, 'u2', '2026-10-05', 'd4');
    expect((await w.called.execute('u1', range)).sort()).toEqual(['d1', 'd2']);
    expect(await w.called.execute('u1', { from: '2026-11-01', to: '2026-11-30' })).toEqual([]);
  });
});
