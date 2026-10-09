import { describe, expect, it } from 'vitest';
import type { PromotionRequestDto } from '@greynote/contracts';
import type { AppError } from '@/shared/errors/AppError.js';
import { DEFAULT_PAY_COMPONENTS } from '../../domain/defaultPayComponents.js';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { Promotion } from '../../domain/promotion.entity.js';
import type { NewPromotion } from '../../domain/promotion.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import { PromotionPlanner, nextMonth } from './promotionPlanner.js';
import { ListPromotionsUseCase, PreviewPromotionUseCase, SchedulePromotionUseCase } from './promotions.usecase.js';

const DESIGNATIONS = [
  { id: 'd-mr', name: 'MR', level: 1 },
  { id: 'd-asm', name: 'ASM', level: 2 },
  { id: 'd-rsm', name: 'RSM', level: 3 },
  { id: 'd-zsm', name: 'ZSM', level: 4 },
  { id: 'd-nsm', name: 'NSM', level: 5 },
];
const LAKH = 100_000 * 100;

/** nsm → rsm → raj (ASM) → mr1, mr2; sam is another ASM under the same rsm. */
const TREE: Array<[id: string, designation: string, manager: string | null]> = [
  ['nsm', 'd-nsm', null],
  ['rsm', 'd-rsm', 'nsm'],
  ['raj', 'd-asm', 'rsm'],
  ['sam', 'd-asm', 'rsm'],
  ['mr1', 'd-mr', 'raj'],
  ['mr2', 'd-mr', 'raj'],
];

function kit(over: { status?: Record<string, User['status']>; scheduled?: Promotion | null } = {}) {
  const users = new Map<string, User>(
    TREE.map(([id]) => [id, { id, employeeCode: id.toUpperCase(), name: id, email: null, phone: null, status: over.status?.[id] ?? 'active', roleId: id === 'admin' ? 'r-admin' : 'r-field', passwordHash: 'x', lastLoginAt: null, isBlocked: false }]),
  );
  users.set('admin', { ...users.get('raj')!, id: 'admin', roleId: 'r-admin' });
  const profiles = new Map<string, EmployeeProfile>(
    TREE.map(([id, designationId, managerId]) => [id, { id: `p-${id}`, userId: id, designationId, payBandId: 'g1', managerId, dateOfJoining: null, probationMonths: null, esiNumber: null, mobileNumber: null, hqId: null, zoneId: null, alternateMobile: null, guardianName: null, dateOfBirth: null, address: null, permanentAddress: null, permanentSameAsPresent: false, qualification: null, qualifications: [], previousEmployment: [], bankDetails: null, documents: [] }]),
  );
  const created: NewPromotion[] = [];
  const full = (input: NewPromotion): Promotion => ({ ...input, id: 'promo1', status: 'SCHEDULED', createdAt: new Date('2026-10-06T00:00:00Z'), ctcAssignmentId: null, appliedAt: null, cancelledAt: null, claimedAt: null, note: null, skippedMoves: [], unplannedReportIds: [] });
  const promotions = {
    create: async (input: (typeof created)[number]) => {
      created.push(input);
      return full(input);
    },
    listByUser: async () => created.map(full),
    list: async () => created.map(full),
    findScheduledByUser: async () => over.scheduled ?? null,
    findById: async () => null,
  };
  const repos = {
    users: { findById: async (id: string) => users.get(id) ?? null, findByIds: async (ids: string[]) => ids.flatMap((id) => (users.has(id) ? [users.get(id)!] : [])) },
    roles: { findById: async (id: string) => ({ id, name: id === 'r-admin' ? 'ADMIN' : 'FIELD' }) },
    designations: { findById: async (id: string) => DESIGNATIONS.find((d) => d.id === id) ?? null, list: async () => DESIGNATIONS },
    payBands: { findById: async (id: string) => (id === 'g1' || id === 'g2' ? { id, name: id.toUpperCase() } : null), list: async () => [{ id: 'g1', name: 'G1' }, { id: 'g2', name: 'G2' }] },
    profiles: {
      findByUserId: async (id: string) => profiles.get(id) ?? null,
      findByUserIds: async (ids: string[]) => ids.flatMap((id) => (profiles.has(id) ? [profiles.get(id)!] : [])),
      findUserIdsByFilter: async (f: { managerId?: string }) => [...profiles.values()].filter((p) => p.managerId === f.managerId).map((p) => p.userId),
    },
    components: { list: async () => DEFAULT_PAY_COMPONENTS.map((c, i) => ({ ...c, id: `c${i}` })) },
    assignments: { findEffective: async () => ({ ctcAnnualPaise: 3 * LAKH }) },
    promotions,
    config: { get: async (key: string) => (key === 'CTC_JUMP_WARN_PERCENT' ? '50' : '') },
    currentMonth: async () => '2026-10',
  };
  const planner = new PromotionPlanner(repos as never);
  return {
    created,
    preview: new PreviewPromotionUseCase(planner),
    schedule: new SchedulePromotionUseCase(planner, promotions as never, repos.profiles as never),
    list: new ListPromotionsUseCase(planner, promotions as never, repos.users as never),
  };
}

const asZsm = (over: Partial<PromotionRequestDto> = {}): PromotionRequestDto => ({
  effectiveFrom: '2026-11',
  toDesignationId: 'd-zsm',
  toManagerId: 'nsm',
  teamMoves: [
    { userId: 'mr1', toManagerId: 'sam' },
    { userId: 'mr2', toManagerId: 'sam' },
  ],
  ...over,
});

describe('previewing a promotion', () => {
  it('shows before and after, the team and where they go, and can be scheduled', async () => {
    const p = await kit().preview.execute('raj', asZsm());
    expect(p).toMatchObject({
      canSchedule: true,
      problems: [],
      earliestMonth: '2026-11',
      employee: { name: 'raj', designation: 'ASM' },
      from: { designation: 'ASM', payBand: { name: 'G1' }, manager: { name: 'rsm' } },
      to: { designation: 'ZSM', payBand: { name: 'G1' }, manager: { name: 'nsm' } },
    });
    expect(p.team.map((t) => [t.person.name, t.toManager?.name, t.stays])).toEqual([['mr1', 'sam', false], ['mr2', 'sam', false]]);
  });

  it('lists the team as unplaced and cannot be scheduled while any direct report has no manager', async () => {
    const p = await kit().preview.execute('raj', asZsm({ teamMoves: [{ userId: 'mr1', toManagerId: 'sam' }] }));
    expect(p.canSchedule).toBe(false);
    expect(p.problems).toEqual([{ field: 'teamMoves', message: expect.stringMatching(/mr2 \(MR2\)/) }]);
    expect(p.team.find((t) => t.person.name === 'mr2')!.toManager).toBeNull();
  });

  it('keeps an inactive report out of the handover', async () => {
    const p = await kit({ status: { mr2: 'inactive' } }).preview.execute('raj', asZsm({ teamMoves: [{ userId: 'mr1', toManagerId: 'sam' }] }));
    expect(p.problems).toEqual([]);
    expect(p.team.map((t) => t.person.name)).toEqual(['mr1']);
  });

  it('refuses a new manager who is in the promoted person’s own team, and a report sent under their own report', async () => {
    const loopOwn = await kit().preview.execute('raj', asZsm({ toManagerId: 'mr1' }));
    expect(loopOwn.problems.map((x) => x.message).join(' ')).toMatch(/mr1 already reports to this employee/);
    const loopReport = await kit().preview.execute('rsm', {
      effectiveFrom: '2026-11',
      toDesignationId: 'd-zsm',
      teamMoves: [{ userId: 'raj', toManagerId: 'mr1' }, { userId: 'sam', toManagerId: 'nsm' }],
    });
    expect(loopReport.problems.map((x) => x.message).join(' ')).toMatch(/mr1 reports to raj/);
  });

  it('only for a coming month, and not when something is already scheduled', async () => {
    expect((await kit().preview.execute('raj', asZsm({ effectiveFrom: '2026-10' }))).problems[0]!.message).toMatch(/2026-11 at the earliest/);
    const scheduled = { id: 'x', userId: 'raj', status: 'SCHEDULED' } as Promotion;
    expect((await kit({ scheduled }).preview.execute('raj', asZsm())).problems[0]!.message).toMatch(/already has a promotion scheduled/);
  });

  it('judges a CTC with no grade range: any amount builds, a big jump only warns', async () => {
    const ok = await kit().preview.execute('mr1', { effectiveFrom: '2026-11', toDesignationId: 'd-asm', ctc: { ctcAnnualPaise: 9 * LAKH }, teamMoves: [] });
    expect(ok.problems).toEqual([]);
    expect(ok.ctc).toMatchObject({ previousAnnualPaise: 3 * LAKH, newAnnualPaise: 9 * LAKH });
    expect(ok.ctc!.lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(9 * LAKH);
    expect(ok.warnings.join(' ')).toMatch(/more than 50%/);
  });
});

describe('scheduling a promotion', () => {
  it('saves it as scheduled with the handover and what it was before, changing nothing yet', async () => {
    const k = kit();
    const saved = await k.schedule.execute('raj', asZsm({ reason: ' Annual review ' }), 'hr1');
    expect(saved).toMatchObject({ status: 'SCHEDULED', effectiveFrom: '2026-11', reason: 'Annual review', from: { designation: 'ASM' }, to: { designation: 'ZSM' } });
    expect(k.created[0]).toMatchObject({ fromDesignationId: 'd-asm', toDesignationId: 'd-zsm', fromManagerId: 'rsm', toManagerId: 'nsm', createdBy: 'hr1' });
    expect(k.created[0]!.teamMoves).toEqual([{ userId: 'mr1', toManagerId: 'sam' }, { userId: 'mr2', toManagerId: 'sam' }]);
  });

  it('is refused with the problem named while a direct report is unplaced, and saves nothing', async () => {
    const k = kit();
    const err = (await k.schedule.execute('raj', asZsm({ teamMoves: [] }), 'hr1').catch((e: AppError) => e)) as AppError;
    expect(err).toMatchObject({ statusCode: 400, message: expect.stringMatching(/2 direct reports who need a manager/) });
    expect(k.created).toHaveLength(0);
  });

  it('lets the whole team stay, which only warns', async () => {
    const k = kit();
    await expect(k.schedule.execute('raj', asZsm({ teamMoves: [{ userId: 'mr1', toManagerId: 'raj' }, { userId: 'mr2', toManagerId: 'raj' }] }), 'hr1')).resolves.toMatchObject({ team: [{ stays: true }, { stays: true }] });
  });

  it('an unknown employee is a 404 and a non-field one is refused', async () => {
    const k = kit();
    await expect(k.schedule.execute('ghost', asZsm(), 'hr1')).rejects.toMatchObject({ statusCode: 404 });
    await expect(k.schedule.execute('admin', asZsm({ teamMoves: [] }), 'hr1')).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Only field employees/) });
  });

  it('lists what was kept, newest first', async () => {
    const k = kit();
    expect(await k.list.execute('raj')).toEqual([]);
    await k.schedule.execute('raj', asZsm(), 'hr1');
    expect(await k.list.execute('raj')).toMatchObject([{ id: 'promo1', status: 'SCHEDULED' }]);
  });
});

describe('nextMonth', () => {
  it('rolls over the year', () => {
    expect(nextMonth('2026-10')).toBe('2026-11');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});
