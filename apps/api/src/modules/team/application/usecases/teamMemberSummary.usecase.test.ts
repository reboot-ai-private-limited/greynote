import { beforeEach, describe, expect, it } from 'vitest';
import type { TeamOverviewPort } from '../../domain/ports.js';
import { ListTeamMembersUseCase } from './listTeamMembers.usecase.js';
import { TeamMemberSummaryUseCase } from './teamMemberSummary.usecase.js';
import { TeamTodayUseCase } from './teamToday.usecase.js';
import { FakeTeam, clockAt } from './teamKit.js';
import { TeamLeavesUseCase } from './teamLeaves.usecase.js';
import { TeamPlansUseCase } from './teamPlans.usecase.js';

const NOON = '2026-10-12T06:30:00Z';
let fake: FakeTeam;
let asked: Array<Parameters<TeamOverviewPort['readTeamOverview']>[0]>;

const overview: TeamOverviewPort = {
  readTeamOverview: async (input) => {
    asked.push(input);
    const row = {
      employee: { id: input.userId ?? '', name: 'x', employeeCode: 'X' },
      workingDays: 8,
    } as never;
    return {
      month: input.month,
      from: '',
      to: '',
      rows: input.userId === 'gone' ? [] : [row],
      totals: {} as never,
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    };
  },
};
const build = () => {
  const clock = clockAt(NOON);
  const members = new ListTeamMembersUseCase(fake, {
    getHq: async () => null,
    getZone: async () => null,
  });
  const today = new TeamTodayUseCase(fake, fake, fake, fake, fake, fake, clock);
  return new TeamMemberSummaryUseCase(members, today, overview, clock);
};

beforeEach(() => {
  fake = new FakeTeam();
  asked = [];
});

describe('TeamMemberSummary', () => {
  it('gives the person, their day today and their month in one read', async () => {
    fake.dcrs.set('mr1|2026-10-12', {
      status: 'DRAFT',
      doctorCalls: 3,
      chemistCalls: 0,
      followups: 0,
    });
    const out = await build().execute('rsm', 'mr1');
    expect(out.member).toMatchObject({ id: 'mr1', depth: 2, managerId: 'asm1' });
    expect(out.today).toMatchObject({ state: 'WORKING', user: { id: 'mr1' } });
    expect(out).toMatchObject({
      date: '2026-10-12',
      month: '2026-10',
      overview: { workingDays: 8 },
    });
    expect(asked[0]).toMatchObject({
      actor: { id: 'rsm', role: 'FIELD' },
      month: '2026-10',
      userId: 'mr1',
    });
  });

  it('takes the month asked for', async () => {
    const out = await build().execute('rsm', 'mr1', '2026-09');
    expect(out.month).toBe('2026-09');
    expect(asked[0]?.month).toBe('2026-09');
  });

  it('still shows someone who has left, without a month row', async () => {
    const out = await build().execute('rsm', 'gone');
    expect(out.member).toMatchObject({ id: 'gone', status: 'inactive' });
    expect(out.overview).toBeNull();
  });

  it('refuses anyone outside the downline, before reading anything about them', async () => {
    await expect(build().execute('rsm', 'stranger')).rejects.toMatchObject({ statusCode: 403 });
    await expect(build().execute('mr1', 'mr2')).rejects.toMatchObject({ statusCode: 403 });
    expect(asked).toEqual([]);
  });
});

describe('one person on the team reads', () => {
  const clock = () => clockAt(NOON);
  const reads = () => ({
    today: new TeamTodayUseCase(fake, fake, fake, fake, fake, fake, clock()),
    plans: new TeamPlansUseCase(fake, fake, fake),
    leaves: new TeamLeavesUseCase(fake, fake),
  });

  it('narrow Today, Plans and Leaves to that person, at any level', async () => {
    const r = reads();
    expect(
      (
        await r.today.execute('rsm', { scope: 'direct', userId: 'mr1', page: 1, pageSize: 50 })
      ).items.map((i) => i.user.id),
    ).toEqual(['mr1']);
    expect(
      (
        await r.plans.execute('rsm', {
          date: '2026-10-13',
          scope: 'all',
          userId: 'mr2',
          page: 1,
          pageSize: 50,
        })
      ).items.map((i) => i.user.id),
    ).toEqual(['mr2']);
    fake.leaves = [
      {
        leaveId: 'a',
        userId: 'mr1',
        leaveType: null,
        startDate: '2026-10-13',
        endDate: '2026-10-13',
        half: null,
        daysCount: 1,
        status: 'APPROVED',
      },
      {
        leaveId: 'b',
        userId: 'mr2',
        leaveType: null,
        startDate: '2026-10-13',
        endDate: '2026-10-13',
        half: null,
        daysCount: 1,
        status: 'APPROVED',
      },
    ];
    expect(
      (
        await r.leaves.execute('rsm', {
          from: '2026-10-01',
          to: '2026-10-31',
          scope: 'all',
          userId: 'mr2',
        })
      ).items.map((i) => i.leaveId),
    ).toEqual(['b']);
  });

  it('refuse a person outside the downline', async () => {
    const r = reads();
    await expect(
      r.today.execute('rsm', { scope: 'all', userId: 'stranger', page: 1, pageSize: 50 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      r.plans.execute('rsm', {
        date: '2026-10-13',
        scope: 'all',
        userId: 'stranger',
        page: 1,
        pageSize: 50,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      r.leaves.execute('rsm', {
        from: '2026-10-01',
        to: '2026-10-31',
        scope: 'all',
        userId: 'stranger',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
