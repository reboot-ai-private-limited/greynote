import type { PlanDayDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { changeStateLabel, changedFields, isStaleChange, listDiff, monthSummary, planDayLabel, sortedEntries } from './plans';

const day = (over: Partial<PlanDayDto> = {}): PlanDayDto => ({ workingType: 'FIELD_WORK', workWith: [], routeIds: ['r1', 'r2'], remarks: null, ...over });

describe('changedFields', () => {
  it('is empty when nothing differs, whatever the order inside a list', () => {
    expect(changedFields(day(), day({ routeIds: ['r2', 'r1'] }))).toEqual([]);
  });
  it('names each part that changed, in reading order', () => {
    const fields = changedFields(day(), day({ workingType: 'MEETING', routeIds: ['r3'], workWith: ['u9'], remarks: 'HQ meeting' }));
    expect(fields.map((f) => f.field)).toEqual(['workingType', 'routes', 'workWith', 'remarks']);
  });
  it('treats no remarks and empty remarks as the same', () => {
    expect(changedFields(day({ remarks: null }), day({ remarks: '' }))).toEqual([]);
  });
});

describe('listDiff', () => {
  it('says what was added, removed and kept', () => {
    expect(listDiff(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'], kept: ['b'] });
    expect(listDiff([], [])).toEqual({ added: [], removed: [], kept: [] });
  });
});

describe('isStaleChange', () => {
  it('is an open change made against an older revision than the plan now has', () => {
    expect(isStaleChange({ open: true, basedOnRevision: 3 }, 4)).toBe(true);
    expect(isStaleChange({ open: true, basedOnRevision: 3 }, 3)).toBe(false);
  });
  it('is never stale once decided, or while the plan is still loading', () => {
    expect(isStaleChange({ open: false, basedOnRevision: 3 }, 9)).toBe(false);
    expect(isStaleChange({ open: true, basedOnRevision: 3 }, undefined)).toBe(false);
  });
});

describe('changeStateLabel', () => {
  it('says where a change stands', () => {
    expect(changeStateLabel({ open: true, applied: false, status: 'SUBMITTED' })).toBe('Waiting for a decision');
    expect(changeStateLabel({ open: false, applied: true, status: 'APPROVED' })).toBe('Approved and applied to the plan');
    expect(changeStateLabel({ open: false, applied: false, status: 'REJECTED' })).toBe('Rejected');
  });
});

describe('monthSummary / planDayLabel / sortedEntries', () => {
  it('counts days by working type', () => {
    expect(monthSummary([{ workingType: 'FIELD_WORK' }, { workingType: 'FIELD_WORK' }, { workingType: 'MEETING' }])).toBe('2 Field work · 1 Meeting');
    expect(monthSummary([])).toBe('No days planned.');
  });
  it('labels a day with its weekday in a fixed zone', () => {
    expect(planDayLabel('2026-10-05')).toBe('Mon, 5 Oct');
  });
  it('sorts entries by date without changing the input', () => {
    const input = [{ planDate: '2026-10-03' }, { planDate: '2026-10-01' }];
    expect(sortedEntries(input).map((e) => e.planDate)).toEqual(['2026-10-01', '2026-10-03']);
    expect(input[0]?.planDate).toBe('2026-10-03');
  });
});
