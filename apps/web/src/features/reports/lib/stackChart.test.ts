import type { SalaryMonthDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { layoutStacks, segmentValues, STACK_SERIES } from './stackChart';

const month = (over: Partial<SalaryMonthDto> = {}): SalaryMonthDto => ({
  month: '2026-04',
  state: 'FINAL',
  finalEmployees: 3,
  draftEmployees: 0,
  basePaise: 9_000_000,
  leaveDeductionPaise: 100_000,
  absentDeductionPaise: 200_000,
  netPaise: 8_700_000,
  employerPaise: 1_080_000,
  costToCompanyPaise: 9_780_000,
  draftNetPaise: 0,
  taPaise: 1_000_000,
  daPaise: 1_000_000,
  reimbursementPaise: 100_000,
  ...over,
});
const size = { width: 760, height: 320, left: 64, right: 12, top: 12, bottom: 34 };

describe('segmentValues', () => {
  it('is net salary, the draft net, TA, DA and reimbursements for the cost view, and the two deductions for the other', () => {
    expect(segmentValues(month(), 'COST')).toEqual({ net: 8_700_000, draftNet: 0, ta: 1_000_000, da: 1_000_000, reimbursement: 100_000 });
    expect(segmentValues(month(), 'DEDUCTIONS')).toEqual({ leave: 100_000, absent: 200_000 });
  });
  it('has nothing for a month that has not started', () => {
    expect(segmentValues(month({ state: 'FUTURE' }), 'COST')).toEqual({});
  });
  it('every series of a view has its own key', () => {
    for (const view of ['COST', 'DEDUCTIONS'] as const) expect(new Set(STACK_SERIES[view].map((s) => s.key)).size).toBe(STACK_SERIES[view].length);
  });
});

describe('layoutStacks', () => {
  it('stacks the segments bottom to top in series order, the whole stack to its total, the tallest within the axis', () => {
    const layout = layoutStacks([month(), month({ month: '2026-05', netPaise: 4_000_000, taPaise: 0, daPaise: 0, reimbursementPaise: 0 })], 'COST', size);
    const g = layout.groups[0]!;
    expect(g.segments.map((s) => s.series.key)).toEqual(['net', 'ta', 'da', 'reimbursement']); // draftNet is 0, so it has no segment
    expect(g.total).toBe(10_800_000);
    expect(g.segments[0]!.rect.y + g.segments[0]!.rect.height).toBeCloseTo(layout.baseline, 5);
    for (let i = 1; i < g.segments.length; i++) expect(g.segments[i]!.rect.y + g.segments[i]!.rect.height).toBeCloseTo(g.segments[i - 1]!.rect.y, 5);
    expect(layout.top).toBeGreaterThanOrEqual(10_800_000);
    expect(layout.groups[1]!.segments).toHaveLength(1);
  });

  it('draws a draft month hatched, apart from the finalized net, and a future month not at all', () => {
    const layout = layoutStacks([month({ state: 'DRAFT', netPaise: 0, draftNetPaise: 8_700_000, taPaise: 0, daPaise: 0, reimbursementPaise: 0 }), month({ state: 'FUTURE' })], 'COST', size);
    expect(layout.groups[0]!.segments.map((s) => [s.series.key, s.series.hatched ?? false])).toEqual([['draftNet', true]]);
    expect(layout.groups[1]!.segments).toEqual([]);
  });

  it('keeps the bars inside their slots and the slots evenly spaced', () => {
    const layout = layoutStacks([month(), month({ month: '2026-05' }), month({ month: '2026-06' })], 'DEDUCTIONS', size);
    const [a, b, c] = layout.groups;
    expect(b!.centerX - a!.centerX).toBeCloseTo(c!.centerX - b!.centerX, 5);
    for (const g of layout.groups) for (const s of g.segments) expect(s.rect.x).toBeGreaterThanOrEqual(g.slot.x);
  });

  it('an empty year still has an axis', () => {
    const layout = layoutStacks([month({ netPaise: 0, taPaise: 0, daPaise: 0, reimbursementPaise: 0 })], 'COST', size);
    expect(layout.ticks.length).toBeGreaterThan(1);
    expect(layout.groups[0]!.segments).toEqual([]);
  });
});
