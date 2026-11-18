import { beforeEach, describe, expect, it } from 'vitest';
import { TeamClock } from '../teamClock.js';
import { FakeTeam } from './teamKit.js';
import { TeamDayUseCase } from './teamDay.usecase.js';

const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00', TEAM_NOT_STARTED_AFTER: '11:00', DAILY_PLAN_SUBMIT_CUTOFF_TIME: '10:00' })[key] ?? '' };
const NOW = new Date('2026-11-17T08:00:00Z');
const base = { scope: 'all' as const, page: 1, pageSize: 50 };

describe('the team board for a day', () => {
  let kit: FakeTeam;
  let board: TeamDayUseCase;
  beforeEach(() => {
    kit = new FakeTeam();
    board = new TeamDayUseCase(kit, kit, kit, kit, kit, kit, kit, new TeamClock(config, () => NOW));
    kit.plans.set('mr1|2026-11-17', { status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], doctorIds: ['d1', 'd2', 'd3'], remarks: 'Camp day' });
    kit.plans.set('mr2|2026-11-17', { status: 'SUBMITTED', workingType: 'FIELD_WORK', routeIds: ['r2'], doctorIds: ['d4'] });
    kit.day.set('mr1|2026-11-17', {
      userId: 'mr1',
      date: '2026-11-17',
      reportStatus: 'SUBMITTED',
      doctorCalls: [
        { doctorId: 'd1', recordedAt: new Date('2026-11-17T05:00:00Z'), remarks: 'Samples asked', geofence: 'PASS' },
        { doctorId: 'd9', recordedAt: new Date('2026-11-17T06:00:00Z'), remarks: null, geofence: 'PASS' },
      ],
      chemistCalls: [{ chemistId: 'c1', recordedAt: new Date('2026-11-17T06:30:00Z') }],
      followups: 1,
    });
  });

  it('puts the routes and the doctors by name, marks which doctors were called, and lists the others under also visited', async () => {
    const out = await board.execute('rsm', { ...base, date: '2026-11-17', userId: 'mr1' });
    const row = out.items[0]!;
    expect(row.plan).toMatchObject({ status: 'APPROVED', remarks: 'Camp day', routes: [{ id: 'r1', name: 'Route r1' }] });
    expect(row.doctors.planned.map((d) => [d.name, d.visited])).toEqual([['Dr d1', true], ['Dr d2', false], ['Dr d3', false]]);
    expect(row.doctors.planned[0]).toMatchObject({ remarks: 'Samples asked', geofence: 'PASS' });
    expect(row.doctors.alsoVisited.map((d) => d.name)).toEqual(['Dr d9']);
    expect(row).toMatchObject({ chemistCalls: 1, followups: 1, report: { status: 'SUBMITTED' }, summary: { planned: 3, visited: 1, missed: 0 } });
  });

  it('today a doctor not yet called is not missed; on a past day it is', async () => {
    const todayRow = (await board.execute('rsm', { ...base, date: '2026-11-17', userId: 'mr1' })).items[0]!;
    expect(todayRow.summary.missed).toBe(0);
    kit.plans.set('mr1|2026-11-16', { status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], doctorIds: ['d1', 'd2'] });
    const past = await board.execute('rsm', { ...base, date: '2026-11-16', userId: 'mr1' });
    expect(past.past).toBe(true);
    expect(past.items[0]?.summary).toEqual({ planned: 2, visited: 0, missed: 2 });
  });

  it('counts the level and filters: plan not approved, and report not sent', async () => {
    const all = await board.execute('rsm', { ...base, date: '2026-11-17' });
    expect(all.totals).toMatchObject({ people: 4, plannedDoctors: 4, visitedDoctors: 1, reportsIn: 1, plansWaiting: 1 });
    expect(all.totals.plansSubmitted).toBeGreaterThanOrEqual(1);
    expect(all.totals.plansSubmitted).toBeLessThanOrEqual(all.totals.people);
    // only a plan someone SENT and nobody has decided is waiting; a draft (or no plan) is not a status
    const unapproved = await board.execute('rsm', { ...base, date: '2026-11-17', filter: 'PLAN_NOT_APPROVED' });
    expect(unapproved.items.map((r) => r.user.id)).toEqual(['mr2']);
    const noReport = await board.execute('rsm', { ...base, date: '2026-11-17', filter: 'REPORT_NOT_SENT' });
    expect(noReport.items.map((r) => r.user.id)).not.toContain('mr1');
  });

  it('a draft is the Tour Plan’s day, not a status: flagged fromTourPlan, with the deadline told apart', async () => {
    kit.plans.set('asm1|2026-11-17', { status: 'DRAFT', workingType: 'FIELD_WORK', routeIds: ['r9'], doctorIds: [] });
    const row = (await board.execute('rsm', { ...base, date: '2026-11-17', userId: 'asm1' })).items[0]!;
    expect(row.plan).toMatchObject({ fromTourPlan: true, deadlinePassed: true });
    expect((await board.execute('rsm', { ...base, date: '2026-11-17' })).totals.plansWaiting).toBe(1);
    const tomorrow = (await board.execute('rsm', { ...base, date: '2026-11-18', userId: 'asm1' })).items[0]!;
    expect(tomorrow.plan).toBeNull();
  });

  it('shows only the downline: a person outside it is a 403', async () => {
    await expect(board.execute('rsm', { ...base, date: '2026-11-17', userId: 'stranger' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('a person on leave is not counted against the plan or the report', async () => {
    kit.leaves = [{ leaveId: 'l1', userId: 'mr2', leaveType: 'Casual', startDate: '2026-11-17', endDate: '2026-11-17', half: null, daysCount: 1, status: 'APPROVED' }];
    const out = await board.execute('rsm', { ...base, date: '2026-11-17' });
    expect(out.items.find((r) => r.user.id === 'mr2')?.onLeave).toBe(true);
    expect(out.totals.onLeave).toBe(1);
    expect((await board.execute('rsm', { ...base, date: '2026-11-17', filter: 'PLAN_NOT_APPROVED' })).items.map((r) => r.user.id)).not.toContain('mr2');
  });
});

import { TeamMemberDaysUseCase } from './teamMemberDays.usecase.js';

describe('one person’s month, day by day', () => {
  it('lists the plan and what happened, newest first, up to tomorrow, and refuses someone outside the downline', async () => {
    const kit = new FakeTeam();
    const planning = Object.assign(Object.create(kit) as FakeTeam, { listDailyPlanDays: async () => [
      { date: '2026-11-16', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['d1', 'd2'], remarks: 'Camp', changedFromMonthly: false },
      { date: '2026-11-17', status: 'SUBMITTED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['d3'], remarks: null, changedFromMonthly: true },
    ] });
    const days = new TeamMemberDaysUseCase(kit, planning, kit, kit, kit, new TeamClock(config, () => NOW));
    kit.day.set('mr1|2026-11-16', { userId: 'mr1', date: '2026-11-16', reportStatus: 'APPROVED', doctorCalls: [{ doctorId: 'd1', recordedAt: new Date('2026-11-16T05:00:00Z'), remarks: 'ok', geofence: 'PASS' }], chemistCalls: [], followups: 0 });
    const out = await days.execute('rsm', 'mr1', '2026-11');
    expect(out.items.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-16']);
    const yesterday = out.items[1]!;
    expect(yesterday.plan).toMatchObject({ status: 'APPROVED', remarks: 'Camp', routes: [{ name: 'Route r1' }] });
    expect(yesterday.doctors.planned.map((d) => [d.name, d.visited])).toEqual([['Dr d1', true], ['Dr d2', false]]);
    expect(yesterday.summary).toEqual({ planned: 2, visited: 1, missed: 1 });
    expect(yesterday.report).toMatchObject({ status: 'APPROVED', doctorCalls: 1 });
    expect(out.items[0]?.summary.missed).toBe(0);
    await expect(days.execute('rsm', 'stranger', '2026-11')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('the carry: a doctor planned and not called is owed from the next day (since when), a call clears him; the day view names them and the month so far', async () => {
    const kit = new FakeTeam();
    const planning = Object.assign(Object.create(kit) as FakeTeam, { listDailyPlanDays: async () => [
      { date: '2026-11-15', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['d1', 'd2'], remarks: null, changedFromMonthly: false },
      { date: '2026-11-16', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['d3'], remarks: null, changedFromMonthly: false },
      { date: '2026-11-17', status: 'APPROVED', workingType: 'FIELD_WORK', routeIds: ['r1'], workWith: [], doctorIds: ['d1'], remarks: null, changedFromMonthly: false },
    ] });
    const days = new TeamMemberDaysUseCase(kit, planning, kit, kit, kit, new TeamClock(config, () => NOW));
    const call = (date: string, id: string) => ({ doctorId: id, recordedAt: new Date(`${date}T05:00:00Z`), remarks: null, geofence: 'PASS' });
    kit.day.set('mr1|2026-11-15', { userId: 'mr1', date: '2026-11-15', reportStatus: 'APPROVED', doctorCalls: [call('2026-11-15', 'd1')], chemistCalls: [], followups: 0 }); // d2 missed
    kit.day.set('mr1|2026-11-16', { userId: 'mr1', date: '2026-11-16', reportStatus: 'APPROVED', doctorCalls: [], chemistCalls: [], followups: 0 }); // d3 missed
    kit.day.set('mr1|2026-11-17', { userId: 'mr1', date: '2026-11-17', reportStatus: 'APPROVED', doctorCalls: [call('2026-11-17', 'd1'), call('2026-11-17', 'd2')], chemistCalls: [], followups: 0 }); // d1 visited; d2 called (not planned): cleared
    const list = await days.execute('rsm', 'mr1', '2026-11');
    expect(list.items.map((d) => [d.date, d.carry])).toEqual([
      ['2026-11-17', { carriedIn: 2, missed: 0, carriedOn: 1, final: false }],
      ['2026-11-16', { carriedIn: 1, missed: 1, carriedOn: 2, final: true }],
      ['2026-11-15', { carriedIn: 0, missed: 1, carriedOn: 1, final: true }],
    ]);
    const day = await days.day('rsm', 'mr1', '2026-11-17');
    expect(day.final).toBe(false); // today: the carry-on is so far
    expect(day.carriedIn.map((c) => [c.name, c.since])).toEqual([['Dr d2', '2026-11-15'], ['Dr d3', '2026-11-16']]);
    expect(day.carriedOn.map((c) => c.name)).toEqual(['Dr d3']);
    expect(day.missedToday).toEqual([]);
    expect(day.month).toEqual({ doctorCalls: 3, missedDays: 2, carriedNow: 1 });
    await expect(days.day('rsm', 'stranger', '2026-11-17')).rejects.toMatchObject({ statusCode: 403 });
    await expect(days.day('rsm', 'mr1', '2026-12-30')).rejects.toMatchObject({ statusCode: 400 });
  });
});
