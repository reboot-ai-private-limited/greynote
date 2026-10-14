import type { PayComponentDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPONENT_DRAFT,
  basisPointsToPercent,
  buildPayComponent,
  buildPayComponentUpdate,
  componentToDraft,
  monthlyOf,
  percentToBasisPoints,
  ruleSummary,
  ruleTypesFor,
} from './ctc';

const fda: PayComponentDto = {
  id: 'c2',
  code: 'FDA',
  name: 'FDA',
  kind: 'EARNING',
  order: 2,
  isActive: true,
  mandatory: false,
  rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] },
};

describe('percentages', () => {
  it('round-trips basis points without a float', () => {
    expect(percentToBasisPoints('0.75')).toBe(75);
    expect(percentToBasisPoints('30')).toBe(3000);
    expect(percentToBasisPoints('12.5')).toBe(1250);
    expect(basisPointsToPercent(75)).toBe('0.75');
    expect(basisPointsToPercent(3000)).toBe('30');
    expect(basisPointsToPercent(1250)).toBe('12.5');
  });
  it('refuses what is not a percentage', () => {
    for (const bad of ['', 'x', '100.01', '101', '-1', '1.234'])
      expect(percentToBasisPoints(bad)).toBeNull();
    expect(percentToBasisPoints('100')).toBe(10_000);
  });
});

describe('monthlyOf', () => {
  it('rounds half up', () => {
    expect(monthlyOf(14_400_000)).toBe(1_200_000);
    expect(monthlyOf(6)).toBe(1);
    expect(monthlyOf(5)).toBe(0);
  });
});

describe('ruleSummary', () => {
  const names = new Map([
    ['BASIC', 'Basic'],
    ['FDA', 'FDA'],
  ]);
  const money = (p: number) => `₹${p / 100}`;
  it('reads each rule in plain words', () => {
    expect(ruleSummary({ type: 'PERCENT_OF_CTC', basisPoints: 75 }, names, money)).toBe(
      '0.75% of CTC',
    );
    expect(
      ruleSummary(
        { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] },
        names,
        money,
      ),
    ).toBe('12% of Basic + FDA');
    expect(ruleSummary({ type: 'FIXED', amountPaise: 600_000 }, names, money)).toBe(
      'Fixed ₹6000 a year',
    );
    expect(ruleSummary({ type: 'BALANCER' }, names, money)).toBe('The rest of the CTC');
  });
});

describe('buildPayComponent', () => {
  const draft = {
    ...EMPTY_COMPONENT_DRAFT,
    code: 'hra',
    name: '  HRA ',
    ruleType: 'PERCENT_OF_CTC' as const,
    percent: '10',
    order: '3',
  };
  it('builds a create body, upper-casing the code', () => {
    expect(buildPayComponent(draft)).toEqual({
      ok: true,
      body: {
        code: 'HRA',
        name: 'HRA',
        kind: 'EARNING',
        rule: { type: 'PERCENT_OF_CTC', basisPoints: 1000 },
        order: 3,
        isActive: true,
        mandatory: false,
      },
    });
  });
  it('builds ESI and professional tax deductions, and a mandatory flag', () => {
    expect(buildPayComponent({ ...draft, code: 'esi', kind: 'DEDUCTION', ruleType: 'ESI_PERCENT', percent: '0.75' })).toMatchObject({ ok: true, body: { code: 'ESI', kind: 'DEDUCTION', rule: { type: 'ESI_PERCENT', basisPoints: 75 } } });
    expect(buildPayComponent({ ...draft, code: 'PTAX', kind: 'DEDUCTION', ruleType: 'PTAX_SLAB', mandatory: true })).toMatchObject({ ok: true, body: { rule: { type: 'PTAX_SLAB' }, mandatory: true } });
  });
  it('offers each kind only the rules that fit it', () => {
    expect(ruleTypesFor('EARNING')).toContain('BALANCER');
    expect(ruleTypesFor('EARNING')).not.toContain('PTAX_SLAB');
    expect(ruleTypesFor('DEDUCTION')).toEqual(expect.arrayContaining(['ESI_PERCENT', 'PTAX_SLAB']));
    expect(ruleTypesFor('DEDUCTION')).not.toContain('BALANCER');
  });
  it('builds a fixed amount in paise', () => {
    expect(buildPayComponent({ ...draft, ruleType: 'FIXED', amount: '6000' })).toMatchObject({
      ok: true,
      body: { rule: { type: 'FIXED', amountPaise: 600_000 } },
    });
  });
  it('reports every bad field at once', () => {
    const r = buildPayComponent({ ...EMPTY_COMPONENT_DRAFT, ruleType: 'PERCENT_OF_COMPONENTS' });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual(['code', 'name', 'of', 'order', 'percent']);
  });
});

describe('buildPayComponentUpdate', () => {
  it('sends only what changed, and nothing when nothing did', () => {
    expect(buildPayComponentUpdate(fda, componentToDraft(fda))).toEqual({ ok: true, body: {} });
    expect(
      buildPayComponentUpdate(fda, { ...componentToDraft(fda), percent: '12.5', isActive: false }),
    ).toEqual({
      ok: true,
      body: {
        rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1250, of: ['BASIC'] },
        isActive: false,
      },
    });
  });
});
