import { describe, expect, it } from 'vitest';
import { monthSummary, planDayLabel, sortedEntries } from './plans';

describe('monthSummary / planDayLabel / sortedEntries', () => {
  it('counts days by working type', () => {
    expect(
      monthSummary([
        { workingType: 'FIELD_WORK' },
        { workingType: 'FIELD_WORK' },
        { workingType: 'MEETING' },
      ]),
    ).toBe('2 Field work · 1 Meeting');
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
