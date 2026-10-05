import { describe, expect, it } from 'vitest';
import { computeCtcBreakdown, CtcBreakdownError, grossAnnualPaise, monthlyPaise, validatePayComponents } from './ctcBreakdown.js';
import type { PayComponent } from './payComponent.entity.js';

const RUPEE = 100;

function c(code: string, order: number, rule: PayComponent['rule'], kind: PayComponent['kind'] = 'EARNING', isActive = true): PayComponent {
  return { id: code, code, name: code, kind, rule, order, isActive };
}

/** The org's rules: Basic 30% of CTC, FDA 10% of Basic, EPF 12% of Basic + FDA, ESI 0.75% of CTC, Medical fixed, Other the rest. */
function orgFormula(basisPointsBasic = 3000, medicalPaise = 0): PayComponent[] {
  return [
    c('BASIC', 1, { type: 'PERCENT_OF_CTC', basisPoints: basisPointsBasic }),
    c('FDA', 2, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] }),
    c('EPF', 3, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] }, 'EMPLOYER_CONTRIBUTION'),
    c('ESI', 4, { type: 'PERCENT_OF_CTC', basisPoints: 75 }, 'EMPLOYER_CONTRIBUTION'),
    c('MEDICAL', 5, { type: 'FIXED', amountPaise: medicalPaise }),
    c('OTHER', 6, { type: 'BALANCER' }),
  ];
}

const amountOf = (lines: ReturnType<typeof computeCtcBreakdown>, code: string) => lines.find((l) => l.code === code)!.amountPaise;

describe('computeCtcBreakdown', () => {
  it('splits ₹1,44,000 by the org rules and the lines add up to the CTC', () => {
    const ctc = 144_000 * RUPEE;
    const lines = computeCtcBreakdown(orgFormula(), ctc);
    expect(amountOf(lines, 'BASIC')).toBe(43_200 * RUPEE);
    expect(amountOf(lines, 'FDA')).toBe(4_320 * RUPEE);
    expect(amountOf(lines, 'EPF')).toBe(570_240); // 12% × ₹47,520
    expect(amountOf(lines, 'ESI')).toBe(1_080 * RUPEE);
    expect(amountOf(lines, 'OTHER')).toBe(ctc - 43_200 * RUPEE - 4_320 * RUPEE - 570_240 - 1_080 * RUPEE);
    expect(lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(ctc);
  });

  it('rounds half up once and the balancer absorbs the rounding', () => {
    for (const ctc of [1_000, 7_001, 99_999, 123_456_789, 144_000 * RUPEE + 1]) {
      const lines = computeCtcBreakdown(orgFormula(), ctc);
      expect(lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(ctc);
    }
  });

  it('takes the medical amount out of the pool before the balancer', () => {
    const ctc = 144_000 * RUPEE;
    const without = amountOf(computeCtcBreakdown(orgFormula(), ctc), 'OTHER');
    const withMedical = amountOf(computeCtcBreakdown(orgFormula(3000, 15_000 * RUPEE), ctc), 'OTHER');
    expect(without - withMedical).toBe(15_000 * RUPEE);
  });

  it('rejects medical so large that nothing is left', () => {
    expect(() => computeCtcBreakdown(orgFormula(3000, 200_000 * RUPEE), 144_000 * RUPEE)).toThrow(CtcBreakdownError);
  });

  it('lets an override replace a line; dependents follow it and the balancer re-absorbs', () => {
    const ctc = 144_000 * RUPEE;
    const lines = computeCtcBreakdown(orgFormula(), ctc, { BASIC: 72_000 * RUPEE });
    expect(amountOf(lines, 'BASIC')).toBe(72_000 * RUPEE);
    expect(lines.find((l) => l.code === 'BASIC')!.isOverridden).toBe(true);
    expect(amountOf(lines, 'FDA')).toBe(7_200 * RUPEE);
    expect(lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(ctc);
  });

  it('refuses to override the balancer or an unknown component', () => {
    expect(() => computeCtcBreakdown(orgFormula(), 144_000 * RUPEE, { OTHER: 1 })).toThrow(CtcBreakdownError);
    expect(() => computeCtcBreakdown(orgFormula(), 144_000 * RUPEE, { NOPE: 1 })).toThrow(CtcBreakdownError);
  });

  it('skips inactive components', () => {
    const formula = orgFormula().map((x) => (x.code === 'ESI' ? { ...x, isActive: false } : x));
    const lines = computeCtcBreakdown(formula, 144_000 * RUPEE);
    expect(lines.find((l) => l.code === 'ESI')).toBeUndefined();
  });

  it('returns lines in display order', () => {
    const lines = computeCtcBreakdown(orgFormula().reverse(), 144_000 * RUPEE);
    expect(lines.map((l) => l.code)).toEqual(['BASIC', 'FDA', 'EPF', 'ESI', 'MEDICAL', 'OTHER']);
  });

  it('rejects a zero or fractional CTC', () => {
    expect(() => computeCtcBreakdown(orgFormula(), 0)).toThrow(CtcBreakdownError);
    expect(() => computeCtcBreakdown(orgFormula(), 100.5)).toThrow(CtcBreakdownError);
  });
});

describe('validatePayComponents', () => {
  it('accepts the org formula, including Basic at exactly 30% and 60%', () => {
    expect(() => validatePayComponents(orgFormula(3000))).not.toThrow();
    expect(() => validatePayComponents(orgFormula(6000))).not.toThrow();
  });

  it('rejects Basic outside 30–60%', () => {
    expect(() => validatePayComponents(orgFormula(2900))).toThrow(/30% and 60%/);
    expect(() => validatePayComponents(orgFormula(6100))).toThrow(/30% and 60%/);
  });

  it('needs exactly one balancer', () => {
    expect(() => validatePayComponents(orgFormula().filter((x) => x.code !== 'OTHER'))).toThrow(/balancer/);
    expect(() => validatePayComponents([...orgFormula(), c('SPECIAL', 7, { type: 'BALANCER' })])).toThrow(/balancer/);
  });

  it('rejects a reference to a missing component, to the balancer, and a loop', () => {
    expect(() => validatePayComponents([...orgFormula(), c('X', 7, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['GHOST'] })])).toThrow(/not an active/);
    expect(() => validatePayComponents([...orgFormula(), c('X', 7, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['OTHER'] })])).toThrow(/balancer/);
    const loop = [
      ...orgFormula(),
      c('A', 7, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['B'] }),
      c('B', 8, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['A'] }),
    ];
    expect(() => validatePayComponents(loop)).toThrow(/loop/);
  });

  it('rejects duplicate codes and out-of-range percentages', () => {
    expect(() => validatePayComponents([...orgFormula(), c('HRA', 7, { type: 'FIXED', amountPaise: 0 }), c('HRA', 8, { type: 'FIXED', amountPaise: 0 })])).toThrow(/share the code/);
    expect(() => validatePayComponents([...orgFormula(), c('HRA', 7, { type: 'PERCENT_OF_CTC', basisPoints: 10_001 })])).toThrow(/between 0 and 100/);
  });
});

describe('gross and monthly', () => {
  it('gross is the CTC less the employer contributions', () => {
    const ctc = 144_000 * RUPEE;
    const lines = computeCtcBreakdown(orgFormula(), ctc);
    expect(grossAnnualPaise(lines)).toBe(ctc - 570_240 - 1_080 * RUPEE);
  });

  it('monthly rounds half up', () => {
    expect(monthlyPaise(144_000 * RUPEE)).toBe(12_000 * RUPEE);
    expect(monthlyPaise(1_000_001)).toBe(83_333);
    expect(monthlyPaise(6)).toBe(1);
  });
});
