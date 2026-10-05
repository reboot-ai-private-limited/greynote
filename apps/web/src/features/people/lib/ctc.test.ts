import type { PayComponentDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPONENT_DRAFT,
  basisPointsToPercent,
  buildAssignCtc,
  buildPayComponent,
  buildPayComponentUpdate,
  buildPreview,
  componentToDraft,
  ctcRangeError,
  gradeRange,
  gradeRangeText,
  monthlyOf,
  parseOverrides,
  percentToBasisPoints,
  ruleSummary,
} from './ctc';

const fda: PayComponentDto = { id: 'c2', code: 'FDA', name: 'FDA', kind: 'EARNING', order: 2, isActive: true, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] } };

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
    for (const bad of ['', 'x', '100.01', '101', '-1', '1.234']) expect(percentToBasisPoints(bad)).toBeNull();
    expect(percentToBasisPoints('100')).toBe(10_000);
  });
});

const g2 = { name: 'G2', ctcMinAnnualPaise: 14_400_000, ctcMaxAnnualPaise: 30_000_000 };

describe('grade range', () => {
  it('has a midpoint average, half up', () => {
    expect(gradeRange(g2)).toEqual({ min: 14_400_000, avg: 22_200_000, max: 30_000_000 });
    expect(gradeRange({ ctcMinAnnualPaise: 1, ctcMaxAnnualPaise: 2 }).avg).toBe(2);
    expect(gradeRangeText(g2)).toMatch(/1,44,000.*3,00,000.*average.*2,22,000/);
  });
  it('allows both ends and refuses 1 paise outside', () => {
    expect(ctcRangeError(14_400_000, g2)).toBeUndefined();
    expect(ctcRangeError(30_000_000, g2)).toBeUndefined();
    expect(ctcRangeError(14_399_999, g2)).toMatch(/G2.*1,44,000.*3,00,000/);
    expect(ctcRangeError(30_000_001, g2)).toMatch(/G2/);
  });
  it('says nothing while there is no amount or no grade yet', () => {
    expect(ctcRangeError(null, g2)).toBeUndefined();
    expect(ctcRangeError(1, undefined)).toBeUndefined();
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
  const names = new Map([['BASIC', 'Basic'], ['FDA', 'FDA']]);
  const money = (p: number) => `₹${p / 100}`;
  it('reads each rule in plain words', () => {
    expect(ruleSummary({ type: 'PERCENT_OF_CTC', basisPoints: 75 }, names, money)).toBe('0.75% of CTC');
    expect(ruleSummary({ type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] }, names, money)).toBe('12% of Basic + FDA');
    expect(ruleSummary({ type: 'FIXED', amountPaise: 600_000 }, names, money)).toBe('Fixed ₹6000 a year');
    expect(ruleSummary({ type: 'BALANCER' }, names, money)).toBe('The rest of the CTC');
  });
});

describe('buildPayComponent', () => {
  const draft = { ...EMPTY_COMPONENT_DRAFT, code: 'hra', name: '  HRA ', ruleType: 'PERCENT_OF_CTC' as const, percent: '10', order: '3' };
  it('builds a create body, upper-casing the code', () => {
    expect(buildPayComponent(draft)).toEqual({ ok: true, body: { code: 'HRA', name: 'HRA', kind: 'EARNING', rule: { type: 'PERCENT_OF_CTC', basisPoints: 1000 }, order: 3, isActive: true } });
  });
  it('builds a fixed amount in paise', () => {
    expect(buildPayComponent({ ...draft, ruleType: 'FIXED', amount: '6000' })).toMatchObject({ ok: true, body: { rule: { type: 'FIXED', amountPaise: 600_000 } } });
  });
  it('reports every bad field at once', () => {
    const r = buildPayComponent({ ...EMPTY_COMPONENT_DRAFT, ruleType: 'PERCENT_OF_COMPONENTS' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['code', 'name', 'of', 'order', 'percent']);
  });
});

describe('buildPayComponentUpdate', () => {
  it('sends only what changed, and nothing when nothing did', () => {
    expect(buildPayComponentUpdate(fda, componentToDraft(fda))).toEqual({ ok: true, body: {} });
    expect(buildPayComponentUpdate(fda, { ...componentToDraft(fda), percent: '12.5', isActive: false })).toEqual({
      ok: true,
      body: { rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1250, of: ['BASIC'] }, isActive: false },
    });
  });
});

describe('the CTC form', () => {
  it('previews only once the CTC is usable, carrying valid overrides and dropping half-typed ones', () => {
    expect(buildPreview('', {})).toBeNull();
    expect(buildPreview('0', {})).toBeNull();
    expect(buildPreview('144000', {})).toEqual({ ctcAnnualPaise: 14_400_000 });
    expect(buildPreview('144000', { MEDICAL: '6000', HRA: '12.' })).toEqual({ ctcAnnualPaise: 14_400_000, overrides: { MEDICAL: 600_000 } });
    expect(parseOverrides({ A: '1.5', B: 'x' })).toEqual({ A: 150 });
  });
  it('builds the save body, with overrides and reason only when present', () => {
    expect(buildAssignCtc({ ctc: '144000', effectiveFrom: '2026-10', reason: '', overrides: {} })).toEqual({ ok: true, body: { ctcAnnualPaise: 14_400_000, effectiveFrom: '2026-10' } });
    expect(buildAssignCtc({ ctc: '180000', effectiveFrom: '2026-11', reason: ' Annual  review ', overrides: { MEDICAL: '6000' } })).toEqual({
      ok: true,
      body: { ctcAnnualPaise: 18_000_000, effectiveFrom: '2026-11', overrides: { MEDICAL: 600_000 }, reason: 'Annual review' },
    });
  });
  it('refuses a CTC outside the grade’s range, per field, and accepts the ends', () => {
    const draft = (ctc: string) => ({ ctc, effectiveFrom: '2026-10', reason: '', overrides: {} });
    expect(buildAssignCtc(draft('100000'), g2)).toMatchObject({ ok: false, errors: { ctc: expect.stringMatching(/G2/) } });
    expect(buildAssignCtc(draft('300000.01'), g2)).toMatchObject({ ok: false });
    expect(buildAssignCtc(draft('144000'), g2)).toMatchObject({ ok: true });
    expect(buildAssignCtc(draft('300000'), g2)).toMatchObject({ ok: true });
  });
  it('refuses a missing CTC or month and a bad override, per field', () => {
    const r = buildAssignCtc({ ctc: '', effectiveFrom: '', reason: '', overrides: { MEDICAL: 'abc' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['ctc', 'effectiveFrom', 'override:MEDICAL']);
  });
});
