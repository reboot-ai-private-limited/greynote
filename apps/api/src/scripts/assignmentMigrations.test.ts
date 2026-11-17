import { describe, expect, it } from 'vitest';
import { buildDownlines, planChemistBackfill, planCopiedRouteCleanup } from './assignmentMigrations.js';

describe('planChemistBackfill', () => {
  const base = {
    chemists: [{ id: 'c1', routeId: 'r1' }, { id: 'c2', routeId: 'r2' }],
    holdersByRoute: new Map([['r1', ['mr1', 'mr2', 'asm']], ['r2', ['mr1']]]),
    eligibleUserIds: new Set(['mr1', 'mr2', 'asm']),
    existing: new Set<string>(),
  };
  it('gives each chemist to every eligible holder of its route', () => {
    expect(planChemistBackfill(base)).toEqual([
      { chemistId: 'c1', userId: 'mr1' }, { chemistId: 'c1', userId: 'mr2' }, { chemistId: 'c1', userId: 'asm' }, { chemistId: 'c2', userId: 'mr1' },
    ]);
  });
  it('skips people who are not active field employees, and pairs already assigned (so a re-run is a no-op)', () => {
    const plan = planChemistBackfill({ ...base, eligibleUserIds: new Set(['mr1', 'mr2']), existing: new Set(['c1:mr1']) });
    expect(plan).toEqual([{ chemistId: 'c1', userId: 'mr2' }, { chemistId: 'c2', userId: 'mr1' }]);
    expect(planChemistBackfill({ ...base, existing: new Set(plan.map((p) => `${p.chemistId}:${p.userId}`).concat('c1:mr1', 'c1:asm')) })).toEqual([]);
  });
  it('a chemist on a route nobody holds gets no one', () => {
    expect(planChemistBackfill({ ...base, chemists: [{ id: 'c9', routeId: 'r9' }] })).toEqual([]);
  });
});

describe('buildDownlines', () => {
  it('collects every depth, and cuts a loop', () => {
    const d = buildDownlines(new Map<string, string | null>([['mr', 'asm'], ['asm', 'rsm'], ['rsm', 'zsm'], ['zsm', null]]));
    expect([...d.get('zsm')!].sort()).toEqual(['asm', 'mr', 'rsm']);
    expect([...d.get('asm')!]).toEqual(['mr']);
    expect(() => buildDownlines(new Map<string, string | null>([['a', 'b'], ['b', 'a']]))).not.toThrow();
  });
});

describe('planCopiedRouteCleanup', () => {
  const downlineOf = buildDownlines(new Map<string, string | null>([['mr', 'asm'], ['asm', 'rsm'], ['rsm', null]]));
  const a = (id: string, userId: string, routeId: string) => ({ id, userId, routeId });
  it('ends a manager’s row for a route someone below them holds, at any depth', () => {
    const plan = planCopiedRouteCleanup({ assignments: [a('1', 'mr', 'r1'), a('2', 'asm', 'r1'), a('3', 'rsm', 'r1')], downlineOf, ownDoctorRoutes: new Set() });
    expect(plan.toEnd).toEqual(['2', '3']); // the MR's own row is never touched
  });
  it('keeps and reports a manager’s route nobody below holds, and one where the manager has their own doctor', () => {
    const plan = planCopiedRouteCleanup({
      assignments: [a('1', 'mr', 'r1'), a('2', 'asm', 'r1'), a('3', 'asm', 'r2')],
      downlineOf,
      ownDoctorRoutes: new Set(['asm:r1']),
    });
    expect(plan.toEnd).toEqual([]);
    expect(plan.kept).toEqual([
      { userId: 'asm', routeId: 'r1', reason: 'MANAGER_HAS_OWN_DOCTORS_THERE' },
      { userId: 'asm', routeId: 'r2', reason: 'NO_ONE_BELOW_HOLDS_IT' },
    ]);
  });
  it('a peer’s route is not a copy', () => {
    const plan = planCopiedRouteCleanup({ assignments: [a('1', 'asm', 'r1'), a('2', 'other', 'r1')], downlineOf, ownDoctorRoutes: new Set() });
    expect(plan.toEnd).toEqual([]);
  });
});
