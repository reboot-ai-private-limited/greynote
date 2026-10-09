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
const org: PayComponent[] = DEFAULT_PAY_COMPONENTS.map((c, i) => ({ ...c, id: `c${i}` }));
const structure = (over: Partial<CtcStructure>): CtcStructure => ({ ...EMPTY_STRUCTURE, ...over });
const amount = (lines: ReturnType<typeof computeStructuredBreakdown>, code: string) =>
  lines.find((l) => l.code === code)?.amountPaise;
const total = (lines: ReturnType<typeof computeStructuredBreakdown>) =>
  lines.reduce((sum, l) => sum + l.amountPaise, 0);

describe('structure: an empty one is the org formula', () => {
  it('changes nothing', () => {
    const lines = computeStructuredBreakdown(org, CTC);
    expect(amount(lines, 'BASIC')).toBe(43_200 * RUPEE);
    expect(amount(lines, 'FDA')).toBe(4_320 * RUPEE);
    expect(total(lines)).toBe(CTC);
  });
});

describe('structure: the worked example', () => {
  it('Basic 40% of ₹1,44,000 is ₹57,600; FDA 12% of Basic is ₹6,912, and 14% is ₹8,064; the lines still add up', () => {
    const at12 = computeStructuredBreakdown(
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

    const at14 = computeStructuredBreakdown(
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
    const base = computeStructuredBreakdown(org, CTC, structure({}), { MEDICAL: 12_000 * RUPEE });
    const lines = computeStructuredBreakdown(org, CTC, structure({ removed: ['MEDICAL'] }));
    expect(lines.find((l) => l.code === 'MEDICAL')).toBeUndefined();
    expect(total(lines)).toBe(CTC);
    expect(amount(lines, 'OTHER')).toBeGreaterThan(amount(base, 'OTHER')!);
  });

  it('an added line appears after the others and the lines add up', () => {
    const lines = computeStructuredBreakdown(
      org,
      CTC,
      structure({
        extras: [
          {
            code: 'CONVEYANCE',
            name: 'Conveyance',
            kind: 'EARNING',
            rule: { type: 'FIXED', amountPaise: 9_600 * RUPEE },
          },
        ],
      }),
    );
    expect(amount(lines, 'CONVEYANCE')).toBe(9_600 * RUPEE);
    expect(lines.at(-1)?.code).toBe('CONVEYANCE');
    expect(total(lines)).toBe(CTC);
  });

  it('an added line can be a percentage of Basic', () => {
    const lines = computeStructuredBreakdown(
      org,
      CTC,
      structure({
        extras: [
          {
            code: 'HRA',
            name: 'HRA',
            kind: 'EARNING',
            rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 4000, of: ['BASIC'] },
          },
        ],
      }),
    );
    expect(amount(lines, 'HRA')).toBe(17_280 * RUPEE);
  });
});

describe('structure: what is refused', () => {
  const refused = (s: Partial<CtcStructure>) => () =>
    computeStructuredBreakdown(org, CTC, structure(s));

  it('Basic and the balancer cannot be removed or re-ruled', () => {
    expect(refused({ removed: ['BASIC'] })).toThrow(/Basic cannot be removed/);
    expect(refused({ removed: ['OTHER'] })).toThrow(/cannot be removed/);
    expect(refused({ ruleOverrides: { OTHER: { type: 'FIXED', amountPaise: 1 } } })).toThrow(
      /cannot be given a rule/,
    );
    expect(refused({ ruleOverrides: { BASIC: { type: 'FIXED', amountPaise: 1 } } })).toThrow(
      /Basic through its percentage/,
    );
  });

  it('Basic must stay between 30% and 60%', () => {
    expect(refused({ basicBasisPoints: 2500 })).toThrow(/between 30% and 60%/);
    expect(refused({ basicBasisPoints: 6500 })).toThrow(/between 30% and 60%/);
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
