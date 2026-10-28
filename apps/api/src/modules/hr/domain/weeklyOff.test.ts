import { everyWeekOffDay, isWeeklyOff, parseWeeklyOffSchedule, weekOfMonth, weeklyOffLabel, weeklyOffsBetween, type WeeklyOffVersion } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';

const SUNDAYS: WeeklyOffVersion = { effectiveFrom: '1970-01-01', rules: [{ weekday: 'SUNDAY', weeks: 'ALL' }] };
const SAT_1_3: WeeklyOffVersion = { effectiveFrom: '2026-11-01', rules: [{ weekday: 'SUNDAY', weeks: 'ALL' }, { weekday: 'SATURDAY', weeks: [1, 3] }] };
const SAT_2_4: WeeklyOffVersion = { effectiveFrom: '2027-01-01', rules: [{ weekday: 'SUNDAY', weeks: 'ALL' }, { weekday: 'SATURDAY', weeks: [2, 4] }] };

describe('weekOfMonth', () => {
  it('counts days 1-7 as the 1st, 8-14 the 2nd, and day 29-31 the 5th', () => {
    expect(['2026-11-01', '2026-11-07', '2026-11-08', '2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22', '2026-11-28', '2026-11-29'].map(weekOfMonth)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });
});

describe('weekly off schedule', () => {
  it('makes the 1st and 3rd Saturday off from the start date, and Sundays always', () => {
    const schedule = [SUNDAYS, SAT_1_3];
    expect(weeklyOffsBetween('2026-11-01', '2026-11-30', schedule)).toEqual([
      { date: '2026-11-01', label: 'Sunday' },
      { date: '2026-11-07', label: '1st Saturday' },
      { date: '2026-11-08', label: 'Sunday' },
      { date: '2026-11-15', label: 'Sunday' },
      { date: '2026-11-21', label: '3rd Saturday' },
      { date: '2026-11-22', label: 'Sunday' },
      { date: '2026-11-29', label: 'Sunday' },
    ]);
  });

  it('leaves dates before the start date on the earlier rules', () => {
    const schedule = [SUNDAYS, SAT_1_3];
    expect(isWeeklyOff('2026-10-03', schedule)).toBe(false); // a 1st Saturday, before the change
    expect(isWeeklyOff('2026-10-04', schedule)).toBe(true);
  });

  it('switches to a later set on its start date and keeps the earlier months as they were', () => {
    const schedule = [SUNDAYS, SAT_1_3, SAT_2_4];
    expect(weeklyOffLabel('2026-12-05', schedule)).toBe('1st Saturday');
    expect(weeklyOffLabel('2027-01-02', schedule)).toBeNull(); // 1st Saturday, no longer off
    expect(weeklyOffLabel('2027-01-09', schedule)).toBe('2nd Saturday');
  });

  it('reads the 5th Saturday only when a rule lists 5', () => {
    expect(weeklyOffLabel('2026-10-31', [SUNDAYS, { effectiveFrom: '2026-01-01', rules: [{ weekday: 'SATURDAY', weeks: [5] }] }])).toBe('5th Saturday');
    expect(weeklyOffLabel('2026-10-31', [SUNDAYS, SAT_1_3])).toBeNull();
  });

  it('has no weekly off before the first set or with an empty set', () => {
    expect(isWeeklyOff('2026-11-01', [{ effectiveFrom: '2026-12-01', rules: [] }])).toBe(false);
    expect(isWeeklyOff('2026-12-06', [SUNDAYS, { effectiveFrom: '2026-12-01', rules: [] }])).toBe(false);
  });

  it('handles a leap day', () => {
    expect(weeklyOffLabel('2028-02-29', [{ effectiveFrom: '2000-01-01', rules: [{ weekday: 'TUESDAY', weeks: [5] }] }])).toBe('5th Tuesday');
  });

  it('gives the every-week day for a phone that only knows one weekday', () => {
    expect(everyWeekOffDay('2026-11-10', [SUNDAYS, SAT_1_3])).toBe('SUNDAY');
    expect(everyWeekOffDay('2026-11-10', [{ effectiveFrom: '2026-01-01', rules: [{ weekday: 'FRIDAY', weeks: 'ALL' }] }])).toBe('FRIDAY');
    expect(everyWeekOffDay('2026-11-10', [{ effectiveFrom: '2026-01-01', rules: [] }])).toBe('SUNDAY');
  });
});

describe('parseWeeklyOffSchedule', () => {
  it('round-trips a valid schedule and sorts and dedupes the weeks', () => {
    const parsed = parseWeeklyOffSchedule('[{"effectiveFrom":"2026-11-01","rules":[{"weekday":"SATURDAY","weeks":[3,1,1]}]}]');
    expect(parsed).toEqual({ ok: true, schedule: [{ effectiveFrom: '2026-11-01', rules: [{ weekday: 'SATURDAY', weeks: [1, 3] }] }] });
  });
  it('refuses sets out of order or starting on the same date', () => {
    expect(parseWeeklyOffSchedule('[{"effectiveFrom":"2026-11-01","rules":[]},{"effectiveFrom":"2026-11-01","rules":[]}]').ok).toBe(false);
  });
});
