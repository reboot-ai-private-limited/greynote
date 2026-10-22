import { describe, expect, it } from 'vitest';
import { monthRows, monthSummary, offDayLabel, planDayLabel, sortedEntries } from './plans';

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

describe('monthRows / offDayLabel', () => {
  const off = [
    { date: '2026-10-02', reason: 'HOLIDAY' as const, name: 'Gandhi Jayanti' },
    { date: '2026-10-04', reason: 'WEEKLY_OFF' as const, name: null },
  ];
  it('puts planned and locked days together in date order, flagging a planned day that is locked', () => {
    const rows = monthRows([{ planDate: '2026-10-05' }, { planDate: '2026-10-02' }], off);
    expect(rows.map((r) => [r.date, r.entry !== null, r.off?.reason ?? null])).toEqual([
      ['2026-10-02', true, 'HOLIDAY'],
      ['2026-10-04', false, 'WEEKLY_OFF'],
      ['2026-10-05', true, null],
    ]);
  });
  it('names the day', () => {
    expect(offDayLabel(off[0]!)).toBe('Holiday · Gandhi Jayanti');
    expect(offDayLabel(off[1]!)).toBe('Weekly off');
  });
});

