import { describe, expect, it } from 'vitest';
import type { DcrMonthRow } from '../domain/ports.js';
import { DcrReport, figuresOf } from './dcrReport.js';

const row = (userId: string, month: string, over: Partial<DcrMonthRow> = {}): DcrMonthRow => ({ userId, month, reportedDays: 20, lateDays: 0, doctorCalls: 0, chemistCalls: 0, followups: 0, geofence: { pass: 0, fail: 0, unverified: 0, override: 0 }, ...over });

function kit(summaries: DcrMonthRow[], over: { called?: string[] } = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const report = new DcrReport(
    {
      summarizeExpenses: async () => [],
      listAcceptedExpenses: async () => [],
      summarizeDcrs: async (range) => (calls.push({ summarize: range }), summaries.filter((s) => s.month >= range.from.slice(0, 7) && s.month <= range.to.slice(0, 7))),
      listCalledDoctorIds: async (userId, range) => (calls.push({ called: { userId, ...range } }), over.called ?? []),
    },
    {
      listAssignedDoctors: async (userId) =>
        userId === 'u1'
          ? [
              { id: 'd1', name: 'Dr Sen', specialty: 'ENT' },
              { id: 'd2', name: 'Dr Ali', specialty: 'Cardiology' },
              { id: 'd3', name: 'Dr Bose', specialty: 'ENT' },
            ]
          : [],
    },
    { getUserSummaries: async (ids) => ids.filter((id) => id === 'u1' || id === 'u2').map((id) => ({ id, name: id === 'u1' ? 'Asha Rao' : 'Bimal Das', employeeCode: id === 'u1' ? 'MR001' : 'MR002' })) },
    { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL' })[key] ?? '' },
    () => new Date('2026-10-07T06:00:00Z'),
  );
  return { report, calls };
}

describe('figuresOf', () => {
  it('adds up the calls, gives calls per reported day to one decimal, and counts what the geofence could not confirm', () => {
    const f = figuresOf({ reportedDays: 20, lateDays: 1, doctorCalls: 100, chemistCalls: 33, followups: 4, geofence: { pass: 120, fail: 5, unverified: 5, override: 3 } });
    expect(f).toMatchObject({ calls: 133, callsPerDay: 6.7, unconfirmed: 10 });
  });
  it('has no calls per day without a reported day', () => {
    expect(figuresOf({ reportedDays: 0, lateDays: 0, doctorCalls: 0, chemistCalls: 0, followups: 0, geofence: { pass: 0, fail: 0, unverified: 0, override: 0 } }).callsPerDay).toBeNull();
  });
});

describe('the DCR year', () => {
  it('twelve months from April, each employee\'s month, the months adding up, the open and future months marked', async () => {
    const { report, calls } = kit([
      row('u1', '2026-04', { reportedDays: 20, lateDays: 2, doctorCalls: 100, chemistCalls: 40, followups: 5, geofence: { pass: 130, fail: 5, unverified: 3, override: 2 } }),
      row('u2', '2026-04', { reportedDays: 10, doctorCalls: 50, chemistCalls: 10, geofence: { pass: 60, fail: 0, unverified: 0, override: 0 } }),
      row('u1', '2026-10', { reportedDays: 4, doctorCalls: 20 }),
    ]);
    const r = await report.year({ year: 2026 });
    expect(calls[0]).toEqual({ summarize: { from: '2026-04-01', to: '2027-03-31' } });
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ month: '2026-04', state: 'ENDED', employees: 2, reportedDays: 30, lateDays: 2, doctorCalls: 150, chemistCalls: 50, followups: 5, calls: 200, callsPerDay: 6.7, unconfirmed: 8 });
    expect(r.months[0]!.geofence).toEqual({ pass: 190, fail: 5, unverified: 3, override: 2 });
    expect(r.months[6]).toMatchObject({ month: '2026-10', state: 'OPEN', employees: 1, reportedDays: 4 });
    expect(r.months[7]).toMatchObject({ state: 'FUTURE', employees: 0, callsPerDay: null });
    expect(r.totals).toMatchObject({ reportedDays: 34, doctorCalls: 170, chemistCalls: 50 });
    expect(r.rows.map((x) => [x.month, x.mr.name])).toEqual([['2026-04', 'Asha Rao'], ['2026-04', 'Bimal Das'], ['2026-10', 'Asha Rao']]);
    expect(r.rows[0]).toMatchObject({ mr: { employeeCode: 'MR001' }, callsPerDay: 7 });
  });

  it('a removed employee shows as removed, and an empty year is twelve empty months', async () => {
    expect((await kit([row('gone', '2026-05')]).report.year({ year: 2026 })).rows[0]!.mr.name).toBe('(removed)');
    const empty = await kit([]).report.year({ year: 2026 });
    expect(empty.rows).toEqual([]);
    expect(empty.months.every((m) => m.reportedDays === 0)).toBe(true);
  });
});

describe('the coverage', () => {
  it('lists the assigned doctors the employee did not call on, by speciality then name, for that month only', async () => {
    const { report, calls } = kit([], { called: ['d1'] });
    const r = await report.coverage({ userId: 'u1', month: '2026-05' });
    expect(calls[0]).toEqual({ called: { userId: 'u1', from: '2026-05-01', to: '2026-05-31' } });
    expect(r).toMatchObject({ mr: { name: 'Asha Rao' }, assigned: 3, visited: 1 });
    expect(r.notVisited.map((d) => d.name)).toEqual(['Dr Ali', 'Dr Bose']);
  });
  it('someone with no doctors has no coverage to speak of, and an unknown employee is a 404', async () => {
    expect(await kit([]).report.coverage({ userId: 'u2', month: '2026-05' })).toMatchObject({ assigned: 0, visited: 0, notVisited: [] });
    await expect(kit([]).report.coverage({ userId: 'nobody', month: '2026-05' })).rejects.toMatchObject({ statusCode: 404 });
  });
});
