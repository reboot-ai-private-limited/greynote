import { describe, expect, it } from 'vitest';
import { judgePromotion, type PlanFacts, type PlanPerson } from './promotionPlan.js';

const person = (id: string, level: number | null, over: Partial<PlanPerson> = {}): PlanPerson => ({ id, name: `P-${id}`, employeeCode: `E${id}`, level, active: true, ...over });

/** Raj (ASM, level 2) with two MR reports, promoted to ZSM from 2026-11. */
const facts = (over: Partial<PlanFacts> = {}, request: Partial<PlanFacts['request']> = {}): PlanFacts => ({
  effectiveFrom: '2026-11',
  earliestMonth: '2026-11',
  employee: { ...person('raj', 2), isField: true, managerId: 'rsm' },
  reports: [person('a', 1), person('b', 1)],
  request: {
    toDesignation: { found: true, level: 4 },
    toPayBand: null,
    toManager: { person: person('nsm', 5), reachesEmployee: false },
    ctc: null,
    teamMoves: [
      { userId: 'a', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false },
      { userId: 'b', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false },
    ],
    ...request,
  },
  currentManager: person('rsm', 3),
  currentLevel: 2,
  alreadyScheduled: false,
  jumpWarnPercent: 50,
  ...over,
});

const messages = (r: ReturnType<typeof judgePromotion>) => r.problems.map((p) => p.message).join(' | ');

describe('judgePromotion', () => {
  it('accepts a promotion with the whole team placed, and says nothing', () => {
    expect(judgePromotion(facts())).toEqual({ problems: [], warnings: [] });
  });

  it('refuses to save while a direct report has no new manager, naming them', () => {
    const r = judgePromotion(facts({}, { teamMoves: [{ userId: 'a', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false }] }));
    expect(r.problems).toEqual([{ field: 'teamMoves', message: expect.stringMatching(/P-raj has 1 direct report who needs a manager from 2026-11: P-b \(Eb\)/) }]);
  });

  it('lets a report stay with the promoted person, with a warning that is not a block', () => {
    const r = judgePromotion(facts({}, { teamMoves: [{ userId: 'a', toManagerId: 'raj', target: null, targetReachesReport: false }, { userId: 'b', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false }] }));
    expect(r.problems).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/1 direct report will keep reporting to P-raj/);
  });

  it('a person with no team needs no handover', () => {
    expect(judgePromotion(facts({ reports: [] }, { teamMoves: [] })).problems).toEqual([]);
  });

  it('refuses an inactive manager, a loop, someone placed twice, and someone who is not a report', () => {
    const bad = judgePromotion(
      facts({}, {
        toManager: { person: person('nsm', 5, { active: false }), reachesEmployee: false },
        teamMoves: [
          { userId: 'a', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: true },
          { userId: 'a', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false },
          { userId: 'zzz', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false },
          { userId: 'b', toManagerId: 'gone', target: person('gone', 2, { active: false }), targetReachesReport: false },
        ],
      }),
    );
    const text = messages(bad);
    expect(text).toMatch(/P-nsm is not active/);
    expect(text).toMatch(/reports to P-a/);
    expect(text).toMatch(/only once/);
    expect(text).toMatch(/not a direct report/);
    expect(text).toMatch(/P-gone is not active/);
  });

  it('only a coming month: the earliest is the next month, and a bad month is refused', () => {
    expect(messages(judgePromotion(facts({ effectiveFrom: '2026-10' })))).toMatch(/2026-11 at the earliest/);
    expect(messages(judgePromotion(facts({ effectiveFrom: '' })))).toMatch(/Choose the month/);
    expect(judgePromotion(facts({ effectiveFrom: '2027-04' })).problems).toEqual([]);
  });

  it('refuses a promotion that changes nothing, a second scheduled one, and a non-field or inactive employee', () => {
    const nothing = facts({}, { toDesignation: null, toManager: null, teamMoves: [{ userId: 'a', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false }, { userId: 'b', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false }] });
    expect(messages(judgePromotion(nothing))).toMatch(/Nothing is changing/);
    expect(messages(judgePromotion(facts({ alreadyScheduled: true })))).toMatch(/already has a promotion scheduled/);
    expect(messages(judgePromotion(facts({ employee: { ...person('raj', 2), isField: false, managerId: null } })))).toMatch(/Only field employees/);
    expect(messages(judgePromotion(facts({ employee: { ...person('raj', 2, { active: false }), isField: true, managerId: null } })))).toMatch(/not active/);
  });

  it('a CTC alone is a change; a bad breakdown is a problem; a big jump only warns', () => {
    const ctcOnly = facts({ reports: [] }, { toDesignation: null, toManager: null, teamMoves: [], ctc: { annualPaise: 20_000_000, previousAnnualPaise: 10_000_000, breakdownError: null } });
    const r = judgePromotion(ctcOnly);
    expect(r.problems).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/more than 50%/);
    const broken = judgePromotion(facts({ reports: [] }, { toDesignation: null, toManager: null, teamMoves: [], ctc: { annualPaise: 5, previousAnnualPaise: null, breakdownError: 'Components exceed the CTC.' } }));
    expect(broken.problems).toEqual([{ field: 'ctcAnnualPaise', message: 'Components exceed the CTC.' }]);
  });

  it('warns, never blocks, on levels: a manager not above the employee, a report under someone not above them, a lowered designation', () => {
    const r = judgePromotion(
      facts({}, {
        toDesignation: { found: true, level: 1 },
        toManager: { person: person('mr2', 1), reachesEmployee: false },
        teamMoves: [
          { userId: 'a', toManagerId: 'p', target: person('p', 1), targetReachesReport: false },
          { userId: 'b', toManagerId: 'sam', target: person('sam', 2), targetReachesReport: false },
        ],
      }),
    );
    expect(r.problems).toEqual([]);
    const text = r.warnings.join(' | ');
    expect(text).toMatch(/lowers P-raj/);
    expect(text).toMatch(/P-mr2 would be P-raj's manager/);
    expect(text).toMatch(/P-p would be P-a's manager/);
  });

  it('with the manager left alone, judges the current one against the new level', () => {
    const r = judgePromotion(facts({}, { toManager: null, toDesignation: { found: true, level: 4 } }));
    expect(r.warnings.join(' ')).toMatch(/P-rsm would be P-raj's manager/);
  });
});
