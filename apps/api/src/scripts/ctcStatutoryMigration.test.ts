import { describe, expect, it } from 'vitest';
import type { PayComponent } from '../modules/identity/domain/payComponent.entity.js';
import { planFormula } from './ctcStatutoryMigration.js';

const c = (code: string, order: number, kind: string, rule: PayComponent['rule'], name = code): PayComponent => ({ id: code.toLowerCase(), code, name, kind: kind as PayComponent['kind'], rule, order, isActive: true, mandatory: false });

/** What a database seeded before 2026-10-14 holds. */
const legacy = (): PayComponent[] => [
  c('BASIC', 1, 'EARNING', { type: 'PERCENT_OF_CTC', basisPoints: 3000 }, 'Basic'),
  c('FDA', 2, 'EARNING', { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] }, 'FDA'),
  c('MEDICAL', 3, 'EARNING', { type: 'FIXED', amountPaise: 0 }, 'Medical allowance'),
  c('OTHER', 4, 'EARNING', { type: 'BALANCER' }, 'Other allowance'),
  c('EPF', 5, 'EMPLOYER_CONTRIBUTION', { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] }, 'EPF (employer)'),
  c('ESI', 6, 'EMPLOYER_CONTRIBUTION', { type: 'PERCENT_OF_CTC', basisPoints: 75 }, 'ESI (employer)'),
];

describe('planFormula', () => {
  it('moves EPF and ESI to employee deductions, adds HRA, Conveyance and mandatory professional tax, and keeps what Admin set', () => {
    const plan = planFormula(legacy());
    expect(plan.problem).toBeNull();
    const after = (code: string) => plan.result.find((x) => x.code === code)!;
    expect(after('EPF')).toMatchObject({ kind: 'DEDUCTION', name: 'EPF Contribution', rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] } });
    expect(after('ESI')).toMatchObject({ kind: 'DEDUCTION', name: 'ESI Contribution', rule: { type: 'ESI_PERCENT', basisPoints: 75 } });
    expect(plan.creates.map((x) => x.code)).toEqual(['HRA', 'CONVEYANCE', 'PTAX']);
    expect(after('PTAX')).toMatchObject({ kind: 'DEDUCTION', mandatory: true, isActive: true, rule: { type: 'PTAX_SLAB' } });
    expect(after('HRA').rule).toEqual({ type: 'PERCENT_OF_COMPONENTS', basisPoints: 6636, of: ['BASIC'] });
    // Basic stays as set (30%), with a note.
    expect(after('BASIC').rule).toEqual({ type: 'PERCENT_OF_CTC', basisPoints: 3000 });
    expect(plan.notes.join(' ')).toMatch(/Basic is 30%/);
  });

  it('is idempotent: planning on its own result changes nothing', () => {
    const first = planFormula(legacy());
    const again = planFormula(first.result);
    expect(again.updates).toEqual([]);
    expect(again.creates).toEqual([]);
    expect(again.problem).toBeNull();
  });

  it('switches off another employer contribution and says so', () => {
    const plan = planFormula([...legacy(), c('GRATUITY', 7, 'EMPLOYER_CONTRIBUTION', { type: 'PERCENT_OF_CTC', basisPoints: 481 })]);
    expect(plan.result.find((x) => x.code === 'GRATUITY')!.isActive).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/GRATUITY was an employer contribution/);
    expect(plan.problem).toBeNull();
  });

  it('turns a professional tax line that was not mandatory on, and adds nothing', () => {
    const base = planFormula(legacy()).result.map((x) => (x.code === 'PTAX' ? { ...x, mandatory: false } : x));
    const plan = planFormula(base);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([{ id: 'new:PTAX', code: 'PTAX', patch: { mandatory: true, isActive: true } }]);
  });

  it('reports a formula that cannot be used rather than writing it', () => {
    const plan = planFormula(legacy().filter((x) => x.code !== 'OTHER'));
    expect(plan.problem).toMatch(/balancer/);
  });
});
