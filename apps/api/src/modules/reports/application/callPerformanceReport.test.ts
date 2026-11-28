import { describe, expect, it } from 'vitest';
import type { CallFiguresPort, DayTypesPort, DesignationLevelsPort, FieldRosterPort, HeldDoctorsPort, WorkingCalendarPort } from '../domain/ports.js';
import { addDays } from '@/shared/time/businessTime.js';
import { CallPerformanceReport, coverageOf, monthsBetween } from './callPerformanceReport.js';

const emp = (id: string, name: string, hqId = 'h1') => ({ id, name, employeeCode: `E-${id}`, designation: null, hqId, zoneId: 'z1' });
const EMPLOYEES = [emp('asm', 'Ravi'), emp('mr1', 'Asha'), emp('mr2', 'Ben', 'h2'), emp('other', 'Zed', 'h3')];
const DOWNLINE: Record<string, string[]> = { asm: ['mr1', 'mr2'] };
const roster: FieldRosterPort = {
  listFieldEmployees: async (only) => EMPLOYEES.filter((e) => !only || only.includes(e.id)),
  getDownline: async (id) => (DOWNLINE[id] ?? []).map((x) => ({ id: x })),
};
const levels: DesignationLevelsPort = { getDesignationLevels: async (ids) => ids.map((userId) => ({ userId, level: userId === 'asm' ? 2 : 1 })) };

/** Asha: days 1–3 Field Work, day 4 a meeting (a report, no calls), day 5 Field Work with a report not counted (not returned). */
const calls: CallFiguresPort = {
  callFigures: async (_range, userIds) => {
    const days = [
      { userId: 'mr1', date: '2026-11-02', doctorCalls: 10, chemistCalls: 3 },
      { userId: 'mr1', date: '2026-11-03', doctorCalls: 8, chemistCalls: 3 },
      { userId: 'mr1', date: '2026-11-04', doctorCalls: 9, chemistCalls: 3 },
      { userId: 'mr1', date: '2026-11-05', doctorCalls: 0, chemistCalls: 0 },
      { userId: 'mr2', date: '2026-11-02', doctorCalls: 6, chemistCalls: 1 },
      { userId: 'asm', date: '2026-11-02', doctorCalls: 4, chemistCalls: 0 },
    ];
    const doctorCalls = [
      { userId: 'mr1', doctorId: 'a1', count: 1 },
      { userId: 'mr1', doctorId: 'a2', count: 1 },
      { userId: 'mr1', doctorId: 'a3', count: 4 },
      { userId: 'mr2', doctorId: 'b1', count: 1 },
      // A call on Asha's doctor by someone else does not count for her.
      { userId: 'mr2', doctorId: 'a4', count: 3 },
    ];
    const keep = <T extends { userId: string }>(r: T[]) => r.filter((x) => !userIds || userIds.includes(x.userId));
    return { days: keep(days), doctorCalls: keep(doctorCalls) };
  },
};
const plans: DayTypesPort = {
  listDailyPlanDays: async (userId) =>
    userId === 'mr1'
      ? [
          { date: '2026-11-02', workingType: 'FIELD_WORK' },
          { date: '2026-11-03', workingType: 'DOCTOR_CAMPAIGN' },
          { date: '2026-11-04', workingType: 'FIELD_WORK' },
          { date: '2026-11-05', workingType: 'MEETING' },
        ]
      : [],
};
const HELD: Record<string, Array<{ id: string; name: string; specialty: string; visitFrequency: number | null }>> = {
  mr1: [
    { id: 'a1', name: 'Dr A', specialty: 'ENT', visitFrequency: 1 },
    { id: 'a2', name: 'Dr B', specialty: 'ENT', visitFrequency: 2 },
    { id: 'a3', name: 'Dr C', specialty: 'ENT', visitFrequency: 4 },
    { id: 'a4', name: 'Dr D', specialty: 'ENT', visitFrequency: 1 },
    { id: 'a5', name: 'Dr E', specialty: 'ENT', visitFrequency: null },
  ],
  mr2: [{ id: 'b1', name: 'Dr F', specialty: 'ENT', visitFrequency: 1 }],
};
const doctors: HeldDoctorsPort = { listAssignedDoctors: async (id) => HELD[id] ?? [] };
/**
 * Sundays are off (1 Nov 2026 is one); 4 Nov is a holiday for Ben only; Asha has half a day's leave on 3 Nov; Ben joined on 3 Nov.
 * "Today" is 6 Nov unless a test says otherwise.
 */
const calendarFor = (today: string): WorkingCalendarPort => ({
  today: async () => today,
  offDates: async (userId, from, to) => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0 || (userId === 'mr2' && d === '2026-11-04')) out.push(d);
    return out;
  },
  leaveDays: async (userId, from, to) => (userId === 'mr1' && from <= '2026-11-03' && to >= '2026-11-03' ? [{ date: '2026-11-03', portion: 0.5 }] : []),
  joinedOn: async (userId) => (userId === 'mr2' ? '2026-11-03' : null),
});
const report = new CallPerformanceReport(roster, levels, calls, plans, doctors, calendarFor('2026-11-06'));
const admin = { id: 'admin', role: 'ADMIN' };

describe('Call average and coverage (2026-11-27)', () => {
  it('call average (2026-11-28): calls on counted reports ÷ working days — weekly off, holidays and leave out, half a day counts half', async () => {
    const r = await report.read({ actor: admin, fromMonth: '2026-11', toMonth: '2026-11' });
    // 1–5 Nov: Sunday 1st off, half a day's leave on the 3rd → 3.5 days; the meeting day (5th) counts, with its calls (none).
    const asha = r.rows.find((x) => x.employee.id === 'mr1')!;
    expect(asha).toMatchObject({ fieldDays: 3, workingDays: 3.5, doctorCalls: 27, chemistCalls: 9, doctorCallAvg: 7.7, chemistCallAvg: 2.6, scope: 'OWN' });
    // Ben joined on the 3rd; the 4th is his holiday: 3rd and 5th → 2 days, one of them not reported, still counted.
    expect(r.rows.find((x) => x.employee.id === 'mr2')).toMatchObject({ workingDays: 2, doctorCalls: 6, doctorCallAvg: 3 });
  });

  it('this month counts up to yesterday, and today only once its report counts; a month ahead has no working days yet', async () => {
    const onThe5th = new CallPerformanceReport(roster, levels, calls, plans, doctors, calendarFor('2026-11-05'));
    const r = await onThe5th.read({ actor: admin, fromMonth: '2026-11', toMonth: '2026-11' });
    expect(r.rows.find((x) => x.employee.id === 'mr1')).toMatchObject({ workingDays: 3.5 }); // reported on the 5th: today counts
    expect(r.rows.find((x) => x.employee.id === 'mr2')).toMatchObject({ workingDays: 1, doctorCallAvg: 6 }); // not reported today: up to the 4th
    const ahead = await report.read({ actor: admin, fromMonth: '2026-12', toMonth: '2026-12' });
    expect(ahead.rows.find((x) => x.employee.id === 'mr1')).toMatchObject({ workingDays: 0, doctorCallAvg: null });
  });

  it('coverage: met at least once, met as often as the frequency, visits made of those owed (capped per doctor), own calls only', async () => {
    const r = await report.read({ actor: admin, fromMonth: '2026-11', toMonth: '2026-11' });
    expect(r.rows.find((x) => x.employee.id === 'mr1')!.coverage).toEqual({
      doctors: 5,
      met: 3,
      withFrequency: 4,
      metFully: 2,
      required: 8,
      made: 6,
      missed: 2,
      coveragePct: 60,
      frequencyPct: 50,
      compliancePct: 75,
    });
  });

  it('a range of months multiplies the visits owed', () => {
    expect(monthsBetween('2026-10', '2026-11')).toBe(2);
    expect(monthsBetween('2026-12', '2027-01')).toBe(2);
    const twoMonths = coverageOf([{ doctor: { id: 'a1', visitFrequency: 1 }, holderId: 'mr1' }], new Map([['mr1|a1', 1]]), 2);
    expect(twoMonths).toMatchObject({ required: 2, made: 1, metFully: 0, compliancePct: 50 });
  });

  it('a manager: own calls, team coverage; totals count the MRs once', async () => {
    const r = await report.read({ actor: admin, fromMonth: '2026-11', toMonth: '2026-11', managerId: 'asm' });
    expect(r.rows.map((x) => x.employee.id)).toEqual(['asm', 'mr1', 'mr2']);
    const ravi = r.rows[0]!;
    expect(ravi).toMatchObject({ isManager: true, scope: 'TEAM', fieldDays: 1, workingDays: 4, doctorCalls: 4, doctorCallAvg: 1, coverage: { doctors: 6, met: 4 } });
    expect(r.totals.coverage).toMatchObject({ doctors: 6, met: 4 });
    // 37 calls over 4 + 3.5 + 2 working days.
    expect(r.totals).toMatchObject({ fieldDays: 5, workingDays: 9.5, doctorCalls: 37, doctorCallAvg: 3.9 });
  });

  it('who sees what: Admin by HQ, a manager their team, an MR only themself; the missed list', async () => {
    expect((await report.read({ actor: admin, fromMonth: '2026-11', toMonth: '2026-11', hqId: 'h2' })).rows.map((x) => x.employee.id)).toEqual(['mr2']);
    expect((await report.read({ actor: { id: 'asm', role: 'FIELD' }, fromMonth: '2026-11', toMonth: '2026-11' })).rows).toHaveLength(3);
    expect((await report.read({ actor: { id: 'mr1', role: 'FIELD' }, fromMonth: '2026-11', toMonth: '2026-11' })).rows.map((x) => x.employee.id)).toEqual(['mr1']);
    await expect(report.missed({ actor: { id: 'mr1', role: 'FIELD' }, userId: 'mr2', fromMonth: '2026-11', toMonth: '2026-11' })).rejects.toMatchObject({ statusCode: 403 });
    const missed = await report.missed({ actor: { id: 'asm', role: 'FIELD' }, userId: 'asm', fromMonth: '2026-11', toMonth: '2026-11' });
    expect(missed.map((d) => [d.id, d.heldBy?.id])).toEqual([['a4', 'mr1'], ['a5', 'mr1']]);
    await expect(report.read({ actor: { id: 'h', role: 'HR' }, fromMonth: '2026-11', toMonth: '2026-11' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
