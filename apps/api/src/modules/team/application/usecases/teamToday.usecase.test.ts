import { beforeEach, describe, expect, it } from 'vitest';
import { TeamTodayUseCase, type TeamTodayQuery } from './teamToday.usecase.js';
import { FakeTeam, clockAt } from './teamKit.js';

const TODAY = '2026-10-12';
const MORNING = '2026-10-12T04:30:00Z'; // 10:00 IST
const NOON = '2026-10-12T06:30:00Z'; // 12:00 IST
const base: TeamTodayQuery = { scope: 'all', page: 1, pageSize: 50 };
const plan = {
  status: 'APPROVED',
  workingType: 'FIELD_WORK',
  routeIds: ['r1'],
  doctorIds: ['d1', 'd2'],
};

let fake: FakeTeam;
const useCase = (at = NOON, settings = {}) =>
  new TeamTodayUseCase(fake, fake, fake, fake, fake, clockAt(at, settings));
const stateOf = async (id: string, q: Partial<TeamTodayQuery> = {}, at = NOON) =>
  (await useCase(at).execute('rsm', { ...base, ...q })).items.find((r) => r.user.id === id)?.state;

beforeEach(() => {
  fake = new FakeTeam();
});

describe('TeamToday', () => {
  it('counts only active people and defaults to today', async () => {
    const r = await useCase().execute('rsm', base);
    expect(r.date).toBe(TODAY);
    expect(r.tiles.total).toBe(4);
    expect(r.items.map((i) => i.user.id)).not.toContain('gone');
  });

  it('is NOT_YET before the not-started time and NOT_STARTED after it', async () => {
    expect(await stateOf('mr1', {}, MORNING)).toBe('NOT_YET');
    expect(await stateOf('mr1', {}, NOON)).toBe('NOT_STARTED');
  });

  it('reads the not-started time from Config', async () => {
    const early = await new TeamTodayUseCase(
      fake,
      fake,
      fake,
      fake,
      fake,
      clockAt(MORNING, { TEAM_NOT_STARTED_AFTER: '09:30' }),
    ).execute('rsm', base);
    expect(early.notStartedAfter).toBe('09:30');
    expect(early.items.find((i) => i.user.id === 'mr1')?.state).toBe('NOT_STARTED');
  });

  it('is WORKING once any call or follow-up is logged, REPORTED once the report is in', async () => {
    fake.dcrs.set(`mr1|${TODAY}`, {
      status: 'DRAFT',
      doctorCalls: 2,
      chemistCalls: 0,
      followups: 0,
    });
    expect(await stateOf('mr1')).toBe('WORKING');
    fake.dcrs.set(`mr1|${TODAY}`, {
      status: 'SUBMITTED',
      doctorCalls: 2,
      chemistCalls: 0,
      followups: 0,
    });
    expect(await stateOf('mr1')).toBe('REPORTED');
  });

  it('an empty draft is still not started', async () => {
    fake.dcrs.set(`mr1|${TODAY}`, {
      status: 'DRAFT',
      doctorCalls: 0,
      chemistCalls: 0,
      followups: 0,
    });
    expect(await stateOf('mr1')).toBe('NOT_STARTED');
  });

  it('a manager-approved leave puts someone on leave; one still waiting does not', async () => {
    const leave = {
      leaveId: 'l1',
      userId: 'mr1',
      leaveType: 'Casual',
      startDate: TODAY,
      endDate: TODAY,
      half: null,
      daysCount: 1,
    } as const;
    fake.leaves = [{ ...leave, status: 'SUBMITTED' }];
    expect(await stateOf('mr1')).toBe('NOT_STARTED');
    expect(
      (await useCase().execute('rsm', base)).items.find((i) => i.user.id === 'mr1')?.leave,
    ).toMatchObject({ status: 'SUBMITTED' });
    fake.leaves = [{ ...leave, status: 'MANAGER_APPROVED' }];
    expect(await stateOf('mr1')).toBe('ON_LEAVE');
  });

  it('a holiday or weekly off is OFF, but work done that day still shows', async () => {
    fake.off.add(`mr1|${TODAY}`);
    fake.off.add(`mr2|${TODAY}`);
    fake.dcrs.set(`mr2|${TODAY}`, {
      status: 'DRAFT',
      doctorCalls: 0,
      chemistCalls: 1,
      followups: 0,
    });
    expect(await stateOf('mr1')).toBe('OFF');
    expect(await stateOf('mr2')).toBe('WORKING');
  });

  it('a past day with no report is MISSED, and a future day is refused', async () => {
    expect(await stateOf('mr1', { date: '2026-10-09' })).toBe('MISSED');
    await expect(useCase().execute('rsm', { ...base, date: '2026-10-13' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('puts people who need attention first: blocked, not started, no plan on a working day', async () => {
    fake.plans.set(`asm1|${TODAY}`, plan);
    fake.plans.set(`asm2|${TODAY}`, plan);
    fake.plans.set(`mr1|${TODAY}`, plan);
    fake.plans.set(`mr2|${TODAY}`, plan);
    fake.dcrs.set(`asm1|${TODAY}`, {
      status: 'SUBMITTED',
      doctorCalls: 3,
      chemistCalls: 0,
      followups: 0,
    });
    fake.dcrs.set(`asm2|${TODAY}`, {
      status: 'DRAFT',
      doctorCalls: 1,
      chemistCalls: 0,
      followups: 0,
    });
    fake.dcrs.set(`mr1|${TODAY}`, {
      status: 'DRAFT',
      doctorCalls: 1,
      chemistCalls: 0,
      followups: 0,
    });
    fake.blocked.add('asm2');
    const r = await useCase().execute('rsm', base);
    // asm2 is blocked; mr2 has not started; asm1 and mr1 are fine.
    expect(r.items.map((i) => [i.user.id, i.attention])).toEqual([
      ['mr2', true],
      ['asm2', true],
      ['mr1', false],
      ['asm1', false],
    ]);
    expect(r.tiles).toMatchObject({
      total: 4,
      blocked: 1,
      attention: 2,
      noPlan: 0,
      NOT_STARTED: 1,
      WORKING: 2,
      REPORTED: 1,
    });
  });

  it('flags a working day with no plan, but not a leave day', async () => {
    fake.leaves = [
      {
        leaveId: 'l1',
        userId: 'mr1',
        leaveType: null,
        startDate: TODAY,
        endDate: TODAY,
        half: null,
        daysCount: 1,
        status: 'APPROVED',
      },
    ];
    const r = await useCase().execute('rsm', base);
    expect(r.items.find((i) => i.user.id === 'mr1')).toMatchObject({
      state: 'ON_LEAVE',
      attention: false,
    });
    expect(r.tiles.noPlan).toBe(3);
  });

  it('filters by state, attention and level, keeping the tiles for the whole level', async () => {
    const r = await useCase().execute('rsm', { ...base, scope: 'direct', state: 'NOT_STARTED' });
    expect(r.items.map((i) => i.user.id)).toEqual(['asm1', 'asm2']);
    expect(r.tiles.total).toBe(2);
    const none = await useCase().execute('rsm', { ...base, attention: true, state: 'REPORTED' });
    expect(none.items).toEqual([]);
    expect(none.tiles.total).toBe(4);
  });

  it('has nothing to show someone with no team', async () => {
    const r = await useCase().execute('mr1', base);
    expect(r.items).toEqual([]);
    expect(r.tiles.total).toBe(0);
  });
});
