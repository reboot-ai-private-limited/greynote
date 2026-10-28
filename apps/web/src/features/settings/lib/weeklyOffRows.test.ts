import { describe, expect, it } from 'vitest';
import { describeRules, draftFromRows, newVersionRow, rowsFromDraft, summariseSchedule, toggleWeek } from './weeklyOffRows';

const STORED = '[{"effectiveFrom":"1970-01-01","rules":[{"weekday":"SUNDAY","weeks":"ALL"}]},{"effectiveFrom":"2026-11-01","rules":[{"weekday":"SUNDAY","weeks":"ALL"},{"weekday":"SATURDAY","weeks":[1,3]}]}]';

describe('weekly off rows', () => {
  it('round-trips a stored schedule', () => {
    expect(draftFromRows(rowsFromDraft(STORED))).toBe(STORED);
  });
  it('shows no rows for an unreadable draft', () => {
    expect(rowsFromDraft('banana')).toEqual([]);
    expect(rowsFromDraft('{}')).toEqual([]);
  });
  it('toggles weeks: leaving "every week" starts a list, and the last one off leaves none', () => {
    const every = { weekday: 'SATURDAY' as const, all: true, weeks: [] };
    const first = toggleWeek(every, 1);
    expect(first).toMatchObject({ all: false, weeks: [1] });
    expect(toggleWeek(toggleWeek(first, 3), 1).weeks).toEqual([3]);
    expect(toggleWeek(first, 1).weeks).toEqual([]);
  });
  it('describes rules in words', () => {
    expect(describeRules([{ weekday: 'SATURDAY', weeks: [1, 3] }, { weekday: 'SUNDAY', weeks: 'ALL' }])).toBe('every Sunday, 1st and 3rd Saturday');
    expect(describeRules([])).toBe('no weekly off');
  });
  it('summarises today’s rules and the next change', () => {
    expect(summariseSchedule(STORED, '2026-10-28')).toBe('every Sunday; from 2026-11-01: every Sunday, 1st and 3rd Saturday');
    expect(summariseSchedule(STORED, '2026-11-02')).toBe('every Sunday, 1st and 3rd Saturday');
  });
  it('starts a new set from the rules in force today, with no date', () => {
    const next = newVersionRow(rowsFromDraft(STORED), '2026-11-02');
    expect(next.effectiveFrom).toBe('');
    expect(describeRules(next.rules.map((r) => ({ weekday: r.weekday, weeks: r.all ? 'ALL' : r.weeks })))).toBe('every Sunday, 1st and 3rd Saturday');
  });
});
