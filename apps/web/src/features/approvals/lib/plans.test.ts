import { describe, expect, it } from 'vitest';
import { amendEntries, changedDates, dayProblem, monthRows, monthSummary, offDayLabel, planDayLabel, sortedEntries, withDay, type DraftDay } from './plans';

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


describe('editing a month', () => {
  const day = (over: Partial<DraftDay> = {}): DraftDay => ({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: ['r1'], remarks: null, returnDate: null, ...over });
  const out = { id: 'o1', name: 'Out', routeType: 'OUT_STATION' as const };

  it('counts only real changes, ignoring trip filler days', () => {
    const original = { '2026-10-01': day(), '2026-10-02': day({ dayKind: 'STAY' }) };
    expect(changedDates(original, { ...original })).toEqual([]);
    expect(changedDates(original, { ...original, '2026-10-01': day({ routeIds: ['r2'] }), '2026-10-05': day() })).toEqual(['2026-10-01', '2026-10-05']);
  });
  it('sends no stay/transit days and only a trip start’s returnDate', () => {
    const body = amendEntries({ '2026-10-02': day({ dayKind: 'STAY' }), '2026-10-01': day({ routeIds: ['o1'], returnDate: '2026-10-03' }), '2026-10-04': day({ remarks: '  ' }) });
    expect(body.map((e) => e.planDate)).toEqual(['2026-10-01', '2026-10-04']);
    expect(body[0]).toMatchObject({ returnDate: '2026-10-03' });
    expect(body[1]).toMatchObject({ remarks: null });
    expect(body[1]).not.toHaveProperty('returnDate');
  });
  it('flags a field day without routes and a trip that runs over a planned or locked day', () => {
    const ctx = { routes: [out], edited: { '2026-10-02': day() }, offDates: ['2026-10-04'] };
    expect(dayProblem(day({ routeIds: [] }), '2026-10-01', ctx)).toMatch(/at least one route/);
    expect(dayProblem(day({ routeIds: ['o1'], returnDate: '2026-10-03' }), '2026-10-01', ctx)).toMatch(/already planned/);
    expect(dayProblem(day({ routeIds: ['o1'], returnDate: '2026-10-05' }), '2026-10-03', { ...ctx, edited: {} })).toMatch(/weekly off or holiday/);
    expect(dayProblem(day({ routeIds: ['r1'], returnDate: '2026-10-05' }), '2026-10-03', ctx)).toMatch(/out-station/);
    expect(dayProblem(day({ routeIds: ['o1'], returnDate: '2026-10-09' }), '2026-10-06', { ...ctx, edited: {} })).toBeNull();
  });
  it('drops a trip’s filler days when its first day is changed or cleared', () => {
    const edited = { '2026-10-01': day({ routeIds: ['o1'], returnDate: '2026-10-03' }), '2026-10-02': day({ dayKind: 'STAY' }), '2026-10-03': day({ dayKind: 'TRANSIT' }) };
    expect(Object.keys(withDay(edited, '2026-10-01', null))).toEqual([]);
    expect(Object.keys(withDay(edited, '2026-10-01', day()))).toEqual(['2026-10-01']);
  });
});
