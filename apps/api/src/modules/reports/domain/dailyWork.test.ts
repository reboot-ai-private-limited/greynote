import { describe, expect, it } from 'vitest';
import { buildDailyWork, type DayInput } from './dailyWork.js';

const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
const names = new Map([['a', 'Dr A'], ['b', 'Dr B'], ['c', 'Dr C']]);
const day = (date: string, plan: string[] | null, called: string[] | null, over: Partial<DayInput> = {}): DayInput => ({
  date,
  attendance: called === null ? 'ABSENT' : 'PRESENT',
  tourWords: 'North 1',
  plan: plan ? { status: 'APPROVED', workingType: 'FIELD_WORK', routeNames: ['North 1'], workWith: [], doctorIds: plan, changedFromMonthly: false, remarks: null } : null,
  report: called === null ? null : { status: 'APPROVED' },
  calls: { doctorIds: called ?? [], chemistCalls: 1, followups: 0, geofence: { pass: called?.length ?? 0, fail: 0, other: 0 } },
  orders: { count: 0, paise: 0 },
  ...over,
});

describe('the month of daily work', () => {
  const work = buildDailyWork({
    month: '2026-11',
    dates,
    today: '2026-11-20',
    names,
    targets: [{ doctorId: 'a', name: 'Dr A', frequency: 2 }, { doctorId: 'b', name: 'Dr B', frequency: 1 }, { doctorId: 'c', name: 'Dr C', frequency: 2 }],
    planned: [{ doctorId: 'a', plannedDays: 1, missedSince: null }, { doctorId: 'b', plannedDays: 2, missedSince: '2026-11-03' }, { doctorId: 'c', plannedDays: 1, missedSince: '2026-11-05' }],
    days: [
      day('2026-11-02', ['a', 'b'], ['a']), // b missed, owed from the 3rd
      day('2026-11-03', ['b'], null), // no report: b missed again, still owed
      day('2026-11-04', null, ['a', 'c']), // a and c called though not planned
      day('2026-11-05', ['c'], []), // report with no doctor calls: c missed
    ],
  });

  it('counts planned, visited, missed per day and carries a missed doctor until a call', () => {
    expect(work.rows.map((r) => [r.planned, r.visited, r.missed, r.carriedIn, r.alsoVisited])).toEqual([
      [2, 1, 1, 0, 0],
      [1, 0, 1, 1, 0],
      [0, 0, 0, 1, 2],
      [1, 0, 1, 1, 0],
    ]);
    expect(work.rows[0]).toMatchObject({ visitedNames: ['Dr A'], missedNames: ['Dr B'], kind: 'Worked', report: 'Approved' });
    expect(work.rows[1]).toMatchObject({ kind: 'Absent', report: 'No report' });
  });

  it('the month in totals: visits made capped per doctor, not called, carried at month end', () => {
    const o = work.overview;
    expect(o.doctors).toMatchObject({ plannedDays: 4, visited: 1, missed: 3, carriedAtEnd: 2, alsoVisited: 2 });
    // a: 2 visits of 2; b: 0 of 1; c: 1 of 2 (called on the 4th).
    expect(o.targets).toEqual({ withTarget: 3, quota: 5, made: 3, missed: 2, notCalled: 1 });
    expect(o.calls.doctor).toBe(3);
    expect(o.reports).toEqual({ sent: 3, notSent: 0 });
    expect(o.days).toMatchObject({ worked: 3, absent: 1 });
    expect(work.doctors.map((d) => [d.name, d.visits, d.missed, d.carriedSince])).toEqual([['Dr B', 0, 1, '2026-11-03'], ['Dr C', 1, 1, '2026-11-05'], ['Dr A', 2, 0, null]]);
  });

  it('a running month is counted only through yesterday', () => {
    const running = buildDailyWork({ month: '2026-11', dates, today: '2026-11-04', names, targets: [], planned: [], days: [day('2026-11-02', ['a'], ['a']), day('2026-11-03', ['b'], ['b']), day('2026-11-04', ['c'], ['c'])] });
    expect(running.countedThrough).toBe('2026-11-03');
    expect(running.rows.map((r) => r.planned)).toEqual([1, 1, null, null]);
  });

  it('a Daily Plan nobody approved does not make a doctor planned, and a draft report does not count calls', () => {
    const w = buildDailyWork({
      month: '2026-11', dates: ['2026-11-02'], today: '2026-11-20', names, targets: [], planned: [],
      days: [{ ...day('2026-11-02', ['a'], ['a']), plan: { status: 'SUBMITTED', workingType: 'FIELD_WORK', routeNames: [], workWith: [], doctorIds: ['a'], changedFromMonthly: false, remarks: null }, report: { status: 'DRAFT' } }],
    });
    expect(w.rows[0]).toMatchObject({ planned: 0, doctorCalls: 0, report: 'Not sent' });
  });
});
