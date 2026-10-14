import { DEFAULT_PTAX_SLABS, parseSlabs } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { computeCtcBreakdown, CtcBreakdownError, deductionsAnnualPaise, grossAnnualPaise, monthlyPaise, validatePayComponents, type CtcContext } from './ctcBreakdown.js';
import { DEFAULT_PAY_COMPONENTS } from './defaultPayComponents.js';
import type { PayComponent } from './payComponent.entity.js';

const RUPEE = 100;
const slabs = (() => {
  const p = parseSlabs(DEFAULT_PTAX_SLABS);
  if (!p.ok) throw new Error(p.error);
  return p.slabs;
})();
export const CTX: CtcContext = { esiCeilingPaise: 21_000 * RUPEE, ptaxSlabs: slabs };

function c(code: string, order: number, rule: PayComponent['rule'], kind: PayComponent['kind'] = 'EARNING', isActive = true, mandatory = false): PayComponent {
  return { id: code, code, name: code, kind, rule, order, isActive, mandatory };
}

/** The slip's formula: Basic 40% of CTC, HRA/FDA/Conveyance a share of Basic, Medical fixed, Special the rest; EPF, ESI, PTax deducted. */
const orgFormula = (basisPointsBasic = 4000, medicalPaise = 0): PayComponent[] =>
  DEFAULT_PAY_COMPONENTS.map((d, i) => {
    if (d.code === 'BASIC') return { ...d, id: d.code, rule: { type: 'PERCENT_OF_CTC', basisPoints: basisPointsBasic } };
    if (d.code === 'MEDICAL') return { ...d, id: d.code, rule: { type: 'FIXED', amountPaise: medicalPaise } };
    return { ...d, id: `c${i}` };
  });

const amountOf = (lines: ReturnType<typeof computeCtcBreakdown>, code: string) => lines.find((l) => l.code === code)!.amountPaise;
const earningsOf = (lines: ReturnType<typeof computeCtcBreakdown>) => lines.filter((l) => l.kind === 'EARNING').reduce((s, l) => s + l.amountPaise, 0);

describe('computeCtcBreakdown', () => {
  it('reproduces the salary slip: ₹14,000 a month, Basic ₹5,600', () => {
    const ctc = 14_000 * 12 * RUPEE;
    const lines = computeCtcBreakdown(orgFormula(), ctc, {}, CTX);
    const monthly = (code: string) => monthlyPaise(amountOf(lines, code));
    expect(monthly('BASIC')).toBe(5_600 * RUPEE);
    expect(monthly('HRA')).toBe(371_616);
    expect(monthly('FDA')).toBe(560 * RUPEE);
    expect(monthly('CONVEYANCE')).toBe(238_336);
    expect(monthly('OTHER')).toBe(174_048);
    expect(monthly('MEDICAL')).toBe(0);
    expect(monthly('EPF')).toBe(73_920); // 12% × (5,600 + 560)
    expect(monthly('PTAX')).toBe(110 * RUPEE);
    // ESI: ₹14,000 is under the ceiling, so 0.75% (₹105) is taken.
    expect(monthly('ESI')).toBe(105 * RUPEE);
    expect(monthlyPaise(earningsOf(lines))).toBe(14_000 * RUPEE);
  });

  it('the earnings always add up to the CTC exactly; deductions are not part of the sum', () => {
    for (const ctc of [120_000 * RUPEE, 120_000 * RUPEE + 1, 168_000 * RUPEE + 77, 123_456_789, 9_999_999_99]) {
      const lines = computeCtcBreakdown(orgFormula(), ctc, {}, CTX);
      expect(earningsOf(lines)).toBe(ctc);
      expect(grossAnnualPaise(lines)).toBe(ctc);
    }
  });

  it('takes the medical amount out of the pool before the balancer', () => {
    const ctc = 240_000 * RUPEE;
    const without = amountOf(computeCtcBreakdown(orgFormula(), ctc, {}, CTX), 'OTHER');
    const withMedical = amountOf(computeCtcBreakdown(orgFormula(4000, 15_000 * RUPEE), ctc, {}, CTX), 'OTHER');
    expect(without - withMedical).toBe(15_000 * RUPEE);
  });

  it('refuses earnings that add up to more than the CTC', () => {
    expect(() => computeCtcBreakdown(orgFormula(4000, 400_000 * RUPEE), 240_000 * RUPEE, {}, CTX)).toThrow(/more than the CTC/);
  });

  it('allows Basic at 100% when nothing else is derived from it', () => {
    const formula = orgFormula(10_000).filter((x) => !['HRA', 'FDA', 'CONVEYANCE'].includes(x.code)).map((x) => (x.code === 'EPF' ? { ...x, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC'] } as PayComponent['rule'] } : x));
    const lines = computeCtcBreakdown(formula, 240_000 * RUPEE, {}, CTX);
    expect(amountOf(lines, 'BASIC')).toBe(240_000 * RUPEE);
    expect(amountOf(lines, 'OTHER')).toBe(0);
    expect(earningsOf(lines)).toBe(240_000 * RUPEE);
  });

  it('refuses Basic at 100% while FDA still takes a share of it: the earnings would exceed the CTC', () => {
    expect(() => computeCtcBreakdown(orgFormula(10_000), 240_000 * RUPEE, {}, CTX)).toThrow(/more than the CTC/);
  });

  it('deducts EPF at 12% of Basic + FDA', () => {
    const lines = computeCtcBreakdown(orgFormula(), 240_000 * RUPEE, {}, CTX);
    expect(amountOf(lines, 'EPF')).toBe(Math.round((amountOf(lines, 'BASIC') + amountOf(lines, 'FDA')) * 0.12));
  });

  it('takes ESI only while the monthly salary is at or below the ceiling', () => {
    const at = computeCtcBreakdown(orgFormula(), 21_000 * 12 * RUPEE, {}, CTX);
    const over = computeCtcBreakdown(orgFormula(), (21_000 * 12 + 12) * RUPEE, {}, CTX);
    expect(amountOf(at, 'ESI')).toBe(Math.round(21_000 * 12 * RUPEE * 0.0075));
    expect(amountOf(over, 'ESI')).toBe(0);
  });

  it('takes the professional tax from the slab of the monthly salary', () => {
    const tax = (monthlyRupees: number) => monthlyPaise(amountOf(computeCtcBreakdown(orgFormula(), monthlyRupees * 12 * RUPEE, {}, CTX), 'PTAX')) / RUPEE;
    expect(tax(10_000)).toBe(110);
    expect(tax(14_999)).toBe(110);
    expect(tax(15_000)).toBe(130);
    expect(tax(19_999)).toBe(130);
    expect(tax(20_000)).toBe(150);
    expect(tax(500_000)).toBe(150);
  });

  it('refuses a monthly salary below the first slab', () => {
    expect(() => computeCtcBreakdown(orgFormula(), 9_999 * 12 * RUPEE, {}, CTX)).toThrow(/lowest monthly salary/);
    expect(() => computeCtcBreakdown(orgFormula(), 119_999 * RUPEE, {}, CTX)).toThrow(CtcBreakdownError);
  });

  it('follows the slabs it is given', () => {
    const parsed = parseSlabs('[{"from":8000,"to":null,"amount":90}]');
    if (!parsed.ok) throw new Error(parsed.error);
    const ctx = { ...CTX, ptaxSlabs: parsed.slabs };
    expect(amountOf(computeCtcBreakdown(orgFormula(), 8_500 * 12 * RUPEE, {}, ctx), 'PTAX')).toBe(90 * 12 * RUPEE);
  });

  it('lets an override replace an earning; dependents follow it and the balancer re-absorbs', () => {
    const ctc = 240_000 * RUPEE;
    const lines = computeCtcBreakdown(orgFormula(), ctc, { BASIC: 72_000 * RUPEE }, CTX);
    expect(amountOf(lines, 'BASIC')).toBe(72_000 * RUPEE);
    expect(lines.find((l) => l.code === 'BASIC')!.isOverridden).toBe(true);
    expect(amountOf(lines, 'FDA')).toBe(7_200 * RUPEE);
    expect(earningsOf(lines)).toBe(ctc);
  });

  it('refuses to override the balancer, a deduction or an unknown component', () => {
    expect(() => computeCtcBreakdown(orgFormula(), 240_000 * RUPEE, { OTHER: 1 }, CTX)).toThrow(CtcBreakdownError);
    expect(() => computeCtcBreakdown(orgFormula(), 240_000 * RUPEE, { PTAX: 1 }, CTX)).toThrow(/deduction/);
    expect(() => computeCtcBreakdown(orgFormula(), 240_000 * RUPEE, { NOPE: 1 }, CTX)).toThrow(CtcBreakdownError);
  });

  it('skips inactive components', () => {
    const formula = orgFormula().map((x) => (x.code === 'ESI' ? { ...x, isActive: false } : x));
    expect(computeCtcBreakdown(formula, 240_000 * RUPEE, {}, CTX).find((l) => l.code === 'ESI')).toBeUndefined();
  });

  it('returns lines in display order', () => {
    const lines = computeCtcBreakdown(orgFormula().reverse(), 240_000 * RUPEE, {}, CTX);
    expect(lines.map((l) => l.code)).toEqual(['BASIC', 'HRA', 'FDA', 'CONVEYANCE', 'OTHER', 'MEDICAL', 'EPF', 'ESI', 'PTAX']);
  });

  it('rejects a zero or fractional CTC', () => {
    expect(() => computeCtcBreakdown(orgFormula(), 0, {}, CTX)).toThrow(CtcBreakdownError);
    expect(() => computeCtcBreakdown(orgFormula(), 100.5, {}, CTX)).toThrow(CtcBreakdownError);
  });
});

describe('validatePayComponents', () => {
  it('accepts the org formula, with Basic anywhere above 0 up to 100% of CTC', () => {
    for (const bp of [1, 2900, 4000, 6100, 10_000]) expect(() => validatePayComponents(orgFormula(bp)), String(bp)).not.toThrow();
  });

  it('rejects a Basic of nothing', () => {
    expect(() => validatePayComponents(orgFormula(0))).toThrow(/more than zero/);
    expect(() => validatePayComponents(orgFormula().map((x) => (x.code === 'BASIC' ? { ...x, rule: { type: 'FIXED', amountPaise: 0 } as PayComponent['rule'] } : x)))).toThrow(/more than zero/);
  });

  it('needs exactly one balancer, and it must be an earning', () => {
    expect(() => validatePayComponents(orgFormula().filter((x) => x.code !== 'OTHER'))).toThrow(/balancer/);
    expect(() => validatePayComponents([...orgFormula(), c('SPECIAL', 10, { type: 'BALANCER' })])).toThrow(/balancer/);
  });

  it('needs exactly one professional tax line, mandatory, and it cannot be switched off', () => {
    expect(() => validatePayComponents(orgFormula().filter((x) => x.code !== 'PTAX'))).toThrow(/professional tax/);
    expect(() => validatePayComponents(orgFormula().map((x) => (x.code === 'PTAX' ? { ...x, isActive: false } : x)))).toThrow(/mandatory/);
    expect(() => validatePayComponents(orgFormula().map((x) => (x.code === 'PTAX' ? { ...x, mandatory: false } : x)))).toThrow(/must be mandatory/);
  });

  it('keeps ESI and tax rules to deductions and the balancer to earnings', () => {
    expect(() => validatePayComponents([...orgFormula(), c('X', 10, { type: 'ESI_PERCENT', basisPoints: 10 })])).toThrow(/deductions/);
    const moved = orgFormula().map((x) => (x.code === 'OTHER' ? { ...x, rule: { type: 'FIXED', amountPaise: 0 } as PayComponent['rule'] } : x));
    expect(() => validatePayComponents([...moved, c('X', 10, { type: 'BALANCER' }, 'DEDUCTION')])).toThrow(/only an earning/);
  });

  it('turns away an employer contribution left from before the change, naming the migration', () => {
    expect(() => validatePayComponents([...orgFormula(), { ...c('EPF2', 10, { type: 'FIXED', amountPaise: 0 }), kind: 'EMPLOYER_CONTRIBUTION' as unknown as PayComponent['kind'] }])).toThrow(/migration/);
  });

  it('rejects a reference to a missing component, to the balancer, to a deduction, and a loop', () => {
    expect(() => validatePayComponents([...orgFormula(), c('X', 10, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['GHOST'] })])).toThrow(/not an active/);
    expect(() => validatePayComponents([...orgFormula(), c('X', 10, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['OTHER'] })])).toThrow(/balancer/);
    expect(() => validatePayComponents([...orgFormula(), c('X', 10, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['EPF'] })])).toThrow(/deduction/);
    const loop = [
      ...orgFormula(),
      c('A', 10, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['B'] }),
      c('B', 11, { type: 'PERCENT_OF_COMPONENTS', basisPoints: 100, of: ['A'] }),
    ];
    expect(() => validatePayComponents(loop)).toThrow(/loop/);
  });

  it('rejects duplicate codes and out-of-range percentages', () => {
    expect(() => validatePayComponents([...orgFormula(), c('Z', 10, { type: 'FIXED', amountPaise: 0 }), c('Z', 11, { type: 'FIXED', amountPaise: 0 })])).toThrow(/share the code/);
    expect(() => validatePayComponents([...orgFormula(), c('Z', 10, { type: 'PERCENT_OF_CTC', basisPoints: 10_001 })])).toThrow(/between 0 and 100/);
  });
});

describe('gross, deductions and monthly', () => {
  it('gross is the CTC itself, and the deductions are counted apart', () => {
    const ctc = 240_000 * RUPEE;
    const lines = computeCtcBreakdown(orgFormula(), ctc, {}, CTX);
    expect(grossAnnualPaise(lines)).toBe(ctc);
    expect(deductionsAnnualPaise(lines)).toBe(amountOf(lines, 'EPF') + amountOf(lines, 'ESI') + amountOf(lines, 'PTAX'));
  });

  it('monthly rounds half up', () => {
    expect(monthlyPaise(144_000 * RUPEE)).toBe(12_000 * RUPEE);
    expect(monthlyPaise(1_000_001)).toBe(83_333);
    expect(monthlyPaise(6)).toBe(1);
  });
});
