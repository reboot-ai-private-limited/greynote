import { beforeEach, describe, expect, it } from 'vitest';
import { TeamLeavesUseCase } from './teamLeaves.usecase.js';
import { TeamPlansUseCase } from './teamPlans.usecase.js';
import { FakeTeam } from './teamKit.js';

let fake: FakeTeam;
beforeEach(() => {
  fake = new FakeTeam();
});

describe('TeamPlans', () => {
  const plans = () => new TeamPlansUseCase(fake, fake, fake);
  const base = { date: '2026-10-13', scope: 'all', page: 1, pageSize: 50 } as const;

  it('shows who has a plan for the day, who has none, and the month’s plan', async () => {
    fake.plans.set('asm1|2026-10-13', {
      status: 'MANAGER_APPROVED',
      workingType: 'FIELD_WORK',
      routeIds: ['r1', 'r2', 'gone'],
      doctorIds: ['d1'],
    });
    fake.monthly.set('asm1|2026-10', 'APPROVED');
    fake.routeTypes.set('r2', 'EX_STATION');
    const r = await plans().execute('rsm', base);
    expect(r.month).toBe('2026-10');
    expect(r.items.find((i) => i.user.id === 'asm1')).toMatchObject({
      dailyPlan: {
        status: 'MANAGER_APPROVED',
        routeCount: 3,
        // An unknown route is left out of the names; the count is still the plan's.
        routes: [
          { id: 'r1', name: 'Route r1', routeType: 'HQ' },
          { id: 'r2', name: 'Route r2', routeType: 'EX_STATION' },
        ],
        doctorCount: 1,
      },
      monthlyPlanStatus: 'APPROVED',
    });
    expect(r.items.find((i) => i.user.id === 'mr1')).toMatchObject({
      dailyPlan: null,
      monthlyPlanStatus: null,
    });
    expect(r.counts).toEqual({ MANAGER_APPROVED: 1, NONE: 3 });
  });

  it('narrows to a status, or to those with no plan, with counts for everyone', async () => {
    fake.plans.set('asm1|2026-10-13', {
      status: 'SUBMITTED',
      workingType: 'FIELD_WORK',
      routeIds: [],
      doctorIds: [],
    });
    expect(
      (await plans().execute('rsm', { ...base, planStatus: 'NONE' })).items.map((i) => i.user.id),
    ).toEqual(['asm2', 'mr1', 'mr2']);
    const submitted = await plans().execute('rsm', { ...base, planStatus: 'SUBMITTED' });
    expect(submitted.items.map((i) => i.user.id)).toEqual(['asm1']);
    expect(submitted.counts).toEqual({ SUBMITTED: 1, NONE: 3 });
  });

  it('leaves out people who left and people outside the team', async () => {
    expect((await plans().execute('rsm', base)).items.map((i) => i.user.id)).not.toContain('gone');
    expect((await plans().execute('mr1', base)).items).toEqual([]);
  });
});

describe('TeamLeaves', () => {
  const leaves = () => new TeamLeavesUseCase(fake, fake);
  const row = (
    leaveId: string,
    userId: string,
    startDate: string,
    endDate: string,
    status: 'SUBMITTED' | 'MANAGER_APPROVED' | 'APPROVED',
  ) =>
    ({
      leaveId,
      userId,
      leaveType: 'Casual',
      startDate,
      endDate,
      half: null,
      daysCount: 1,
      status,
    }) as const;

  it('lists the team’s leaves touching the window, with who they belong to', async () => {
    fake.leaves = [
      row('a', 'mr1', '2026-10-13', '2026-10-14', 'APPROVED'),
      row('b', 'mr2', '2026-11-20', '2026-11-20', 'APPROVED'),
      row('c', 'outsider', '2026-10-13', '2026-10-13', 'APPROVED'),
    ];
    const r = await leaves().execute('rsm', { from: '2026-10-01', to: '2026-10-31', scope: 'all' });
    expect(r.items.map((i) => [i.leaveId, i.user.name])).toEqual([['a', 'Person mr1']]);
  });

  it('filters by status and level', async () => {
    fake.leaves = [
      row('a', 'mr1', '2026-10-13', '2026-10-13', 'SUBMITTED'),
      row('b', 'asm1', '2026-10-14', '2026-10-14', 'APPROVED'),
    ];
    const q = { from: '2026-10-01', to: '2026-10-31' } as const;
    expect(
      (await leaves().execute('rsm', { ...q, scope: 'all', status: 'SUBMITTED' })).items.map(
        (i) => i.leaveId,
      ),
    ).toEqual(['a']);
    expect(
      (await leaves().execute('rsm', { ...q, scope: 'direct' })).items.map((i) => i.leaveId),
    ).toEqual(['b']);
  });

  it('refuses a backwards or oversized window', async () => {
    await expect(
      leaves().execute('rsm', { from: '2026-10-10', to: '2026-10-01', scope: 'all' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      leaves().execute('rsm', { from: '2026-01-01', to: '2026-12-31', scope: 'all' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
