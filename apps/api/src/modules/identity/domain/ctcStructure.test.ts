import { DEFAULT_PTAX_SLABS, parseSlabs } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyStructure,
  computeStructuredBreakdown,
  EMPTY_STRUCTURE,
  type CtcStructure,
} from './ctcBreakdown.js';
import { DEFAULT_PAY_COMPONENTS } from './defaultPayComponents.js';
import type { PayComponent } from './payComponent.entity.js';

const RUPEE = 100;
const CTC = 144_000 * RUPEE;
const CTX = { esiCeilingPaise: 21_000 * RUPEE, ptaxSlabs: (parseSlabs(DEFAULT_PTAX_SLABS) as { ok: true; slabs: import('@greynote/contracts').Slab[] }).slabs };
const compute = (o: PayComponent[], ctc: number, s: CtcStructure = EMPTY_STRUCTURE, overrides: Record<string, number> = {}) => computeStructuredBreakdown(o, ctc, s, overrides, CTX);
const org: PayComponent[] = DEFAULT_PAY_COMPONENTS.map((c, i) => ({ ...c, id: `c${i}` }));
const structure = (over: Partial<CtcStructure>): CtcStructure => ({ ...EMPTY_STRUCTURE, ...over });
const amount = (lines: ReturnType<typeof computeStructuredBreakdown>, code: string) =>
  lines.find((l) => l.code === code)?.amountPaise;
/** The earnings: they add up to the CTC. Deductions are worked out beside them. */
const total = (lines: ReturnType<typeof computeStructuredBreakdown>) =>
  lines.filter((l) => l.kind === 'EARNING').reduce((sum, l) => sum + l.amountPaise, 0);

describe('structure: an empty one is the org formula', () => {
  it('changes nothing', () => {
    const lines = compute(org, CTC);
    expect(amount(lines, 'BASIC')).toBe(57_600 * RUPEE);
    expect(amount(lines, 'FDA')).toBe(5_760 * RUPEE);
    expect(total(lines)).toBe(CTC);
  });
});

describe('structure: the worked example', () => {
  it('Basic 40% of ₹1,44,000 is ₹57,600; FDA 12% of Basic is ₹6,912, and 14% is ₹8,064; the lines still add up', () => {
    const at12 = compute(
      org,
      CTC,
      structure({
        basicBasisPoints: 4000,
        ruleOverrides: { FDA: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC'] } },
      }),
    );
    expect(amount(at12, 'BASIC')).toBe(57_600 * RUPEE);
    expect(amount(at12, 'FDA')).toBe(6_912 * RUPEE);
    expect(total(at12)).toBe(CTC);

    const at14 = compute(
      org,
      CTC,
      structure({
        basicBasisPoints: 4000,
        ruleOverrides: { FDA: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1400, of: ['BASIC'] } },
      }),
    );
    expect(amount(at14, 'FDA')).toBe(8_064 * RUPEE);
    // The balancer gave up exactly what FDA took (EPF, which follows FDA, moves too).
    expect(total(at14)).toBe(CTC);
    expect(amount(at14, 'OTHER')).toBeLessThan(amount(at12, 'OTHER')!);
  });
});

describe('structure: removing and adding', () => {
  it('a removed line is gone and the balancer takes its share', () => {
    const base = compute(org, CTC, structure({}), { MEDICAL: 12_000 * RUPEE });
    const lines = compute(org, CTC, structure({ removed: ['MEDICAL'] }));
    expect(lines.find((l) => l.code === 'MEDICAL')).toBeUndefined();
    expect(total(lines)).toBe(CTC);
    expect(amount(lines, 'OTHER')).toBeGreaterThan(amount(base, 'OTHER')!);
  });

  it('an added line appears after the others and the lines add up', () => {
    const lines = compute(
      org,
      CTC,
      structure({
        extras: [
          {
            code: 'TRAVEL',
            name: 'Travel',
            kind: 'EARNING',
            rule: { type: 'FIXED', amountPaise: 9_600 * RUPEE },
          },
        ],
      }),
    );
    expect(amount(lines, 'TRAVEL')).toBe(9_600 * RUPEE);
    expect(lines.at(-1)?.code).toBe('TRAVEL');
    expect(total(lines)).toBe(CTC);
  });

  it('an added line can be a percentage of Basic', () => {
    const lines = compute(
      org,
      CTC,
      structure({
        extras: [
          {
            code: 'BONUS_B',
            name: 'Bonus on Basic',
            kind: 'EARNING',
            rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] },
          },
        ],
      }),
    );
    expect(amount(lines, 'BONUS_B')).toBe(5_760 * RUPEE);
  });
});

describe('structure: what is refused', () => {
  const refused = (s: Partial<CtcStructure>) => () =>
    compute(org, CTC, structure(s));

  it('Basic and the balancer cannot be removed or re-ruled', () => {
    expect(refused({ removed: ['BASIC'] })).toThrow(/Basic cannot be removed/);
    expect(refused({ removed: ['OTHER'] })).toThrow(/cannot be removed/);
    expect(refused({ ruleOverrides: { OTHER: { type: 'FIXED', amountPaise: 1 } } })).toThrow(
      /cannot be given a rule/,
    );
    expect(refused({ ruleOverrides: { BASIC: { type: 'FIXED', amountPaise: 1 } } })).toThrow(
      /percentage or monthly amount/,
    );
  });

  it('Basic can be any share of the CTC up to 100%, as long as the earnings still fit', () => {
    expect(() => compute(org, CTC, structure({ basicBasisPoints: 2500 }))).not.toThrow();
    expect(() => compute(org, CTC, structure({ basicBasisPoints: 4500 }))).not.toThrow();
    // HRA, FDA and Conveyance are shares of Basic, so with them Basic cannot pass about 45%; with them removed it can reach 100%.
    expect(refused({ basicBasisPoints: 6500 })).toThrow(/more than the CTC/);
    expect(refused({ basicBasisPoints: 10_000 })).toThrow(/more than the CTC/);
    const all = compute(org, CTC, structure({ basicBasisPoints: 10_000, removed: ['HRA', 'FDA', 'CONVEYANCE', 'EPF'] }));
    expect(amount(all, 'BASIC')).toBe(CTC);
    expect(total(all)).toBe(CTC);
  });

  it('Basic can be a monthly amount instead of a share', () => {
    const lines = compute(org, CTC, structure({ basicMonthlyPaise: 5_000 * RUPEE }));
    expect(amount(lines, 'BASIC')).toBe(60_000 * RUPEE);
    expect(total(lines)).toBe(CTC);
    expect(refused({ basicMonthlyPaise: 5_000 * RUPEE, basicBasisPoints: 4000 })).toThrow(/not both/);
  });

  it('professional tax is mandatory: it cannot be removed or given another rule for one employee', () => {
    expect(refused({ removed: ['PTAX'] })).toThrow(/mandatory and cannot be removed/);
    expect(refused({ ruleOverrides: { PTAX: { type: 'FIXED', amountPaise: 1 } } })).toThrow(/mandatory/);
  });

  it('a CTC under the lowest monthly salary is refused for any structure', () => {
    expect(() => compute(org, 119_999 * RUPEE, structure({}))).toThrow(/lowest monthly salary/);
  });

  it('a line another line is worked out from cannot be removed', () => {
    expect(refused({ removed: ['FDA'] })).toThrow(/EPF is worked out from FDA/);
  });

  it('no second balancer, no clashing or malformed codes', () => {
    expect(
      refused({ extras: [{ code: 'X1', name: 'X', kind: 'EARNING', rule: { type: 'BALANCER' } }] }),
    ).toThrow(/Only one line/);
    expect(
      refused({
        extras: [
          { code: 'FDA', name: 'Again', kind: 'EARNING', rule: { type: 'FIXED', amountPaise: 1 } },
        ],
      }),
    ).toThrow(/already exists/);
    expect(
      refused({
        extras: [
          {
            code: 'bad code',
            name: 'Bad',
            kind: 'EARNING',
            rule: { type: 'FIXED', amountPaise: 1 },
          },
        ],
      }),
    ).toThrow(/capitals/);
  });

  it('lines adding up to more than the CTC are refused with the shortfall', () => {
    expect(
      refused({
        extras: [
          {
            code: 'BONUS',
            name: 'Bonus',
            kind: 'EARNING',
            rule: { type: 'FIXED', amountPaise: CTC },
          },
        ],
      }),
    ).toThrow(/more than the CTC/);
  });
});

describe('structure: applyStructure is pure', () => {
  it('does not touch the org list', () => {
    const before = JSON.stringify(org);
    applyStructure(org, structure({ basicBasisPoints: 4000, removed: ['MEDICAL'] }));
    expect(JSON.stringify(org)).toBe(before);
  });
});
