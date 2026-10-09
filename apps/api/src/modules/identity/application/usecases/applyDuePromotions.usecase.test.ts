import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_COMPONENTS } from '../../domain/defaultPayComponents.js';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { Promotion } from '../../domain/promotion.entity.js';
import type { User } from '../../domain/user.entity.js';
import { ApplyDuePromotionsUseCase, PROMOTION_CLAIM_LEASE_MS } from './applyDuePromotions.usecase.js';
import { PromotionPlanner } from './promotionPlanner.js';
import { CancelPromotionUseCase } from './promotions.usecase.js';

/** nsm → rsm → raj (ASM) → mr1, mr2, with sam another ASM under rsm and lee an ASM under nsm. */
const TREE: Array<[string, string, string | null]> = [
  ['nsm', 'd-nsm', null],
  ['rsm', 'd-rsm', 'nsm'],
  ['raj', 'd-asm', 'rsm'],
  ['sam', 'd-asm', 'rsm'],
  ['lee', 'd-asm', 'nsm'],
  ['mr1', 'd-mr', 'raj'],
  ['mr2', 'd-mr', 'raj'],
];
const DESIGNATIONS = [
  { id: 'd-mr', name: 'MR', level: 1 },
  { id: 'd-asm', name: 'ASM', level: 2 },
  { id: 'd-rsm', name: 'RSM', level: 3 },
  { id: 'd-zsm', name: 'ZSM', level: 4 },
  { id: 'd-nsm', name: 'NSM', level: 5 },
];
const LAKH = 100_000 * 100;

const promo = (over: Partial<Promotion> = {}): Promotion => ({
  id: 'p1',
  userId: 'raj',
  effectiveFrom: '2026-11',
  status: 'SCHEDULED',
  fromDesignationId: 'd-asm',
  toDesignationId: 'd-zsm',
  fromPayBandId: 'g1',
  toPayBandId: 'g2',
  fromManagerId: 'rsm',
  toManagerId: 'nsm',
  ctc: null,
  teamMoves: [
    { userId: 'mr1', toManagerId: 'sam' },
    { userId: 'mr2', toManagerId: 'sam' },
  ],
  reason: null,
  createdBy: 'hr1',
  createdAt: new Date('2026-10-06T00:00:00Z'),
  ctcAssignmentId: null,
  appliedAt: null,
  cancelledAt: null,
  claimedAt: null,
  note: null,
  skippedMoves: [],
  unplannedReportIds: [],
  ...over,
});

function kit(initial: Promotion[], opts: { month?: string; inactive?: string[]; extraReports?: string[] } = {}) {
  let month = opts.month ?? '2026-11';
  let clock = new Date('2026-11-01T01:00:00Z');
  const rows = new Map(initial.map((p) => [p.id, { ...p }]));
  const users = new Map<string, User>();
  const profiles = new Map<string, EmployeeProfile>();
  const addPerson = (id: string, designationId: string, managerId: string | null) => {
    users.set(id, { id, employeeCode: id.toUpperCase(), name: id, email: null, phone: null, status: opts.inactive?.includes(id) ? 'inactive' : 'active', roleId: 'r-field', passwordHash: 'x', lastLoginAt: null, isBlocked: false });
    profiles.set(id, { id: `p-${id}`, userId: id, designationId, payBandId: 'g1', managerId, dateOfJoining: null, probationMonths: null, esiNumber: null, mobileNumber: null, alternateMobile: null, guardianName: null, dateOfBirth: null, address: null, permanentAddress: null, permanentSameAsPresent: false, qualification: null, qualifications: [], previousEmployment: [], bankDetails: null, documents: [] });
  };
  for (const [id, d, m] of TREE) addPerson(id, d, m);
  for (const id of opts.extraReports ?? []) addPerson(id, 'd-mr', 'raj');
  const history: Array<Record<string, unknown>> = [];
  const ctcRows: Array<Record<string, unknown>> = [];
  const failNextCtcWrite = { value: false };

  const promotions = {
    claimDue: async (m: string, now: Date, leaseMs: number) => {
      const due = [...rows.values()]
        .filter((p) => p.status === 'SCHEDULED' && p.effectiveFrom <= m && (p.claimedAt === null || p.claimedAt.getTime() < now.getTime() - leaseMs))
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
      if (!due) return null;
      due.claimedAt = now;
      return { ...due };
    },
    markCtcAssignment: async (id: string, ctcId: string) => void (rows.get(id)!.ctcAssignmentId = ctcId),
    markApplied: async (id: string, i: { appliedAt: Date; note: string | null; skippedMoves: Promotion['skippedMoves']; unplannedReportIds: string[] }) => void Object.assign(rows.get(id)!, { status: 'APPLIED', ...i }),
    markFailed: async (id: string, note: string) => void (rows.get(id)!.note = note),
    cancel: async (id: string, at: Date) => {
      const r = rows.get(id);
      if (!r || r.status !== 'SCHEDULED') return false;
      Object.assign(r, { status: 'CANCELLED', cancelledAt: at });
      return true;
    },
    findById: async (id: string) => (rows.has(id) ? { ...rows.get(id)! } : null),
    findScheduledByUser: async () => null,
    list: async () => [...rows.values()],
  };
  const repos = {
    promotions,
    profiles: {
      findByUserId: async (id: string) => profiles.get(id) ?? null,
      findByUserIds: async (ids: string[]) => ids.flatMap((id) => (profiles.has(id) ? [profiles.get(id)!] : [])),
      findUserIdsByFilter: async (f: { managerId?: string }) => [...profiles.values()].filter((p) => p.managerId === f.managerId).map((p) => p.userId),
      upsert: async (id: string, input: Partial<EmployeeProfile>) => {
        const merged = { ...profiles.get(id)!, ...input };
        profiles.set(id, merged);
        return merged;
      },
    },
    users: { findById: async (id: string) => users.get(id) ?? null, findByIds: async (ids: string[]) => ids.flatMap((id) => (users.has(id) ? [users.get(id)!] : [])) },
    components: { list: async () => DEFAULT_PAY_COMPONENTS.map((c, i) => ({ ...c, id: `c${i}` })) },
    assignments: {
      findEffective: async () => null,
      create: async (input: Record<string, unknown>) => {
        if (failNextCtcWrite.value) throw new Error('db down');
        ctcRows.push(input);
        return { ...input, id: `ctc${ctcRows.length}` };
      },
    },
    history: { record: async (input: Record<string, unknown>) => (history.push(input), input) },
  };
  const apply = new ApplyDuePromotionsUseCase(repos.promotions as never, repos.profiles as never, repos.users as never, repos.components as never, repos.assignments as never, repos.history as never, async () => month, () => clock);
  const planner = new PromotionPlanner({
    ...repos,
    roles: { findById: async () => ({ id: 'r-field', name: 'FIELD' }) },
    designations: { findById: async (id: string) => DESIGNATIONS.find((d) => d.id === id) ?? null, list: async () => DESIGNATIONS },
    payBands: { findById: async (id: string) => ({ id, name: id.toUpperCase() }), list: async () => [{ id: 'g1', name: 'G1' }, { id: 'g2', name: 'G2' }] },
    config: { get: async () => '50' },
    currentMonth: async () => month,
  } as never);
  return {
    apply,
    planner,
    cancel: new CancelPromotionUseCase(planner, promotions as never, () => clock),
    rows,
    profiles,
    history,
    ctcRows,
    failNextCtcWrite,
    setMonth: (m: string) => (month = m),
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    managerOf: (id: string) => profiles.get(id)?.managerId,
  };
}

describe('applying due promotions', () => {
  it('on the month: changes designation, grade and manager, moves the team, and keeps the history', async () => {
    const k = kit([promo()]);
    expect(await k.apply.execute()).toEqual({ applied: 1, failed: 0 });
    expect(k.profiles.get('raj')).toMatchObject({ designationId: 'd-zsm', payBandId: 'g2', managerId: 'nsm' });
    expect([k.managerOf('mr1'), k.managerOf('mr2')]).toEqual(['sam', 'sam']);
    expect(k.rows.get('p1')).toMatchObject({ status: 'APPLIED', note: null, skippedMoves: [], unplannedReportIds: [] });
    expect(k.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'mr1', managerId: 'sam', previousManagerId: 'raj', effectiveFrom: '2026-11', source: 'PROMOTION', promotionId: 'p1' }),
      expect.objectContaining({ userId: 'raj', managerId: 'nsm', previousManagerId: 'rsm', source: 'PROMOTION' }),
    ]));
  });

  it('does nothing before its month, and nothing a second time', async () => {
    const k = kit([promo()], { month: '2026-10' });
    expect(await k.apply.execute()).toEqual({ applied: 0, failed: 0 });
    expect(k.profiles.get('raj')).toMatchObject({ designationId: 'd-asm', managerId: 'rsm' });
    k.setMonth('2026-11');
    expect((await k.apply.execute()).applied).toBe(1);
    expect(await k.apply.execute()).toEqual({ applied: 0, failed: 0 });
  });

  it('catches up a promotion whose month passed while nothing ran', async () => {
    const k = kit([promo({ effectiveFrom: '2026-11' })], { month: '2027-01' });
    expect((await k.apply.execute()).applied).toBe(1);
    expect(k.history[0]).toMatchObject({ effectiveFrom: '2026-11' });
  });

  it('two runs at once apply it once', async () => {
    const k = kit([promo({ ctc: { ctcAnnualPaise: 3 * LAKH, overrides: {} } })]);
    const [a, b] = await Promise.all([k.apply.execute(), k.apply.execute()]);
    expect(a.applied + b.applied).toBe(1);
    expect(k.ctcRows).toHaveLength(1);
  });

  it('saves the CTC as a revision from the promotion month, once, even if the rest has to be retried', async () => {
    const k = kit([promo({ ctc: { ctcAnnualPaise: 3 * LAKH, overrides: { MEDICAL: 600_000 } } })]);
    await k.apply.execute();
    expect(k.ctcRows).toEqual([expect.objectContaining({ userId: 'raj', ctcAnnualPaise: 3 * LAKH, effectiveFrom: '2026-11', reason: 'Promotion', createdBy: 'hr1' })]);
    expect(k.rows.get('p1')!.ctcAssignmentId).toBe('ctc1');
    // A retry of a promotion that already has its revision does not save another.
    const again = kit([promo({ ctc: { ctcAnnualPaise: 3 * LAKH, overrides: {} }, ctcAssignmentId: 'ctc9' })]);
    await again.apply.execute();
    expect(again.ctcRows).toHaveLength(0);
  });

  it('a failure leaves everything as it was, says why, and is retried once the claim lapses', async () => {
    const k = kit([promo({ ctc: { ctcAnnualPaise: 3 * LAKH, overrides: {} } })]);
    k.failNextCtcWrite.value = true;
    expect(await k.apply.execute()).toEqual({ applied: 0, failed: 1 });
    expect(k.rows.get('p1')).toMatchObject({ status: 'SCHEDULED', note: 'db down' });
    expect(k.profiles.get('raj')).toMatchObject({ designationId: 'd-asm', managerId: 'rsm' });
    expect(k.managerOf('mr1')).toBe('raj');
    expect(await k.apply.execute()).toEqual({ applied: 0, failed: 0 }); // still held
    k.failNextCtcWrite.value = false;
    k.advance(PROMOTION_CLAIM_LEASE_MS + 1000);
    expect(await k.apply.execute()).toEqual({ applied: 1, failed: 0 });
    expect(k.profiles.get('raj')).toMatchObject({ designationId: 'd-zsm' });
  });

  it('a report who stays keeps their manager; one moved by someone else meanwhile is left alone', async () => {
    const k = kit([promo({ teamMoves: [{ userId: 'mr1', toManagerId: 'raj' }, { userId: 'mr2', toManagerId: 'sam' }] })]);
    k.profiles.get('mr2')!.managerId = 'lee';
    await k.apply.execute();
    expect(k.managerOf('mr1')).toBe('raj');
    expect(k.managerOf('mr2')).toBe('lee');
    expect(k.history.filter((h) => h['userId'] === 'mr2')).toEqual([]);
  });

  it('a new manager who is no longer usable leaves the report where they were, applies the rest, and shows it needs attention', async () => {
    const k = kit([promo()], { inactive: ['sam'] });
    expect(await k.apply.execute()).toEqual({ applied: 1, failed: 0 });
    expect(k.profiles.get('raj')).toMatchObject({ designationId: 'd-zsm' });
    expect(k.managerOf('mr1')).toBe('raj');
    const saved = k.rows.get('p1')!;
    expect(saved).toMatchObject({ status: 'APPLIED', note: '2 planned moves could not be carried out.' });
    expect(saved.skippedMoves).toHaveLength(2);
    const [view] = await k.planner.views([{ ...saved }]);
    expect(view!.attention.map((a) => a.kind)).toEqual(['STILL_WITH_PROMOTED', 'STILL_WITH_PROMOTED', 'NOTE']);
    expect(view!.attention[0]!.message).toMatch(/could not be moved to sam and still reports to raj/);
  });

  it('someone added after it was scheduled stays with the promoted person and is flagged, before and after', async () => {
    const k = kit([promo()], { extraReports: ['newbie'] });
    const [before] = await k.planner.views([{ ...k.rows.get('p1')! }]);
    expect(before!.attention).toEqual([expect.objectContaining({ kind: 'NOT_IN_PLAN', person: expect.objectContaining({ name: 'newbie' }) })]);
    await k.apply.execute();
    expect(k.managerOf('newbie')).toBe('raj');
    expect(k.rows.get('p1')!.unplannedReportIds).toEqual(['newbie']);
    const [after] = await k.planner.views([{ ...k.rows.get('p1')! }]);
    expect(after!.attention).toEqual([expect.objectContaining({ kind: 'STILL_WITH_PROMOTED' })]);
    k.profiles.get('newbie')!.managerId = 'sam'; // HR places them
    const [fixed] = await k.planner.views([{ ...k.rows.get('p1')! }]);
    expect(fixed!.attention).toEqual([]);
  });

  it('a chosen own manager who now reports to the promoted person is not applied, but the grade is', async () => {
    const k = kit([promo({ toManagerId: 'mr1', teamMoves: [{ userId: 'mr1', toManagerId: 'raj' }, { userId: 'mr2', toManagerId: 'sam' }] })]);
    await k.apply.execute();
    expect(k.profiles.get('raj')).toMatchObject({ designationId: 'd-zsm', payBandId: 'g2', managerId: 'rsm' });
    expect(k.rows.get('p1')!.note).toMatch(/would now report to this employee/);
  });

  it('refuses to apply for an employee who has been deactivated', async () => {
    const k = kit([promo()], { inactive: ['raj'] });
    expect(await k.apply.execute()).toEqual({ applied: 0, failed: 1 });
    expect(k.rows.get('p1')!.note).toMatch(/no longer active/);
    expect(k.managerOf('mr1')).toBe('raj');
  });
});

describe('cancelling', () => {
  it('cancels a scheduled one, and it then never applies', async () => {
    const k = kit([promo()]);
    expect(await k.cancel.execute('p1')).toMatchObject({ status: 'CANCELLED' });
    expect(await k.apply.execute()).toEqual({ applied: 0, failed: 0 });
    expect(k.managerOf('mr1')).toBe('raj');
  });

  it('refuses one already applied or cancelled, and an unknown one', async () => {
    const k = kit([promo({ id: 'done', status: 'APPLIED' })]);
    await expect(k.cancel.execute('done')).rejects.toMatchObject({ statusCode: 409 });
    await expect(k.cancel.execute('nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});
