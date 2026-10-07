import { describe, expect, it } from 'vitest';
import { AttendanceCalendar, monthBounds } from './attendanceCalendar.js';

/** October 2026: 1 Oct is a Thursday. Joined on the 3rd; today is the 20th. */
function kit(over: { config?: Record<string, string>; joined?: Date | null; plans?: Array<{ date: string; status: string; workingType: string }> } = {}) {
  const config: Record<string, string> = { BUSINESS_TIMEZONE: 'Asia/Kolkata', ABSENT_DEDUCTS_SALARY: 'true', STRIKE_DEDUCTS_SALARY: 'false', ...over.config };
  const calendar = new AttendanceCalendar(
    { getEmploymentDetails: async () => ({ dateOfJoining: over.joined === undefined ? new Date('2026-10-02T20:00:00Z') : over.joined }) } as never, // 3 Oct 01:30 IST
    {
      // Sundays 4, 11, 18, 25 are the weekly off, and 2 Oct (Gandhi Jayanti) a holiday that also appears among the off dates.
      listOffDates: async () => ['2026-10-02', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'],
      listHolidayDates: async () => ['2026-10-02'],
      listLeaveDates: async () => ['2026-10-07', '2026-10-08'],
    } as never,
    { listDailyPlanDays: async () => over.plans ?? [] } as never,
    { listReportedDates: async () => ['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-20'] } as never,
    { get: async (key: string) => config[key] ?? '' },
    () => new Date('2026-10-20T06:00:00Z'),
  );
  return calendar;
}

describe('monthBounds', () => {
  it('lists every date of the month, including a leap February', () => {
    expect(monthBounds('2026-10')).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2026-10').dates).toHaveLength(31);
    expect(monthBounds('2028-02').dates).toHaveLength(29);
  });
});

describe('an employee\'s month', () => {
  it('works each day out: before joining, holiday, weekly off, leave, present, absent, and the future', async () => {
    const m = await kit().month('u1', '2026-10');
    const at = (d: string) => m.days.find((x) => x.date === d)!.status;
    expect(at('2026-10-01')).toBe('BEFORE_JOINING');
    expect(at('2026-10-02')).toBe('BEFORE_JOINING'); // before the 3rd, even though it is a holiday
    expect(at('2026-10-03')).toBe('ABSENT'); // the joining day: a working Saturday with no report
    expect(at('2026-10-04')).toBe('WEEKLY_OFF');
    expect(at('2026-10-05')).toBe('PRESENT');
    expect(at('2026-10-07')).toBe('LEAVE');
    expect(at('2026-10-10')).toBe('ABSENT');
    expect(at('2026-10-20')).toBe('PRESENT'); // today, with a report
    expect(at('2026-10-21')).toBe('NOT_YET');
    expect(m.days).toHaveLength(31);
    expect(m.counts).toMatchObject({ BEFORE_JOINING: 2, WEEKLY_OFF: 3, LEAVE: 2, NOT_YET: 11 });
  });

  it('a holiday that is also an off date is a holiday, not a weekly off', async () => {
    const m = await kit({ joined: null }).month('u1', '2026-10');
    expect(m.days.find((d) => d.date === '2026-10-02')!.status).toBe('HOLIDAY');
  });

  it('counts the absent days and says what payroll would deduct', async () => {
    const m = await kit().month('u1', '2026-10');
    // Working days from the 3rd to the 19th, not off, not leave, not reported: 3, 10, 17, 19 → wait, 19 is a Monday with no report.
    expect(m.days.filter((d) => d.status === 'ABSENT').map((d) => d.date)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-19']);
    expect(m).toMatchObject({ absentDays: 4, strikeDays: 0, deductibleDays: 4, absentDeducts: true, strikeDeducts: false });
  });

  it('an approved Strike plan is a strike day, free of deduction by default; a draft or rejected one excuses nothing', async () => {
    const plans = [
      { date: '2026-10-10', status: 'APPROVED', workingType: 'STRIKE' },
      { date: '2026-10-17', status: 'MANAGER_APPROVED', workingType: 'STRIKE' },
      { date: '2026-10-19', status: 'DRAFT', workingType: 'STRIKE' },
      { date: '2026-10-03', status: 'APPROVED', workingType: 'FIELD_WORK' },
    ];
    const m = await kit({ plans }).month('u1', '2026-10');
    expect(m.counts).toMatchObject({ STRIKE: 2, ABSENT: 2 });
    expect(m).toMatchObject({ absentDays: 2, strikeDays: 2, deductibleDays: 2 });
  });

  it('strike days are deducted only when their own switch is on, and nothing is when absent days are not', async () => {
    const plans = [{ date: '2026-10-10', status: 'APPROVED', workingType: 'STRIKE' }];
    expect((await kit({ plans, config: { STRIKE_DEDUCTS_SALARY: 'true' } }).month('u1', '2026-10')).deductibleDays).toBe(4);
    expect((await kit({ plans, config: { ABSENT_DEDUCTS_SALARY: 'false', STRIKE_DEDUCTS_SALARY: 'true' } }).month('u1', '2026-10')).deductibleDays).toBe(0);
  });

  it('an unrecorded joining date never excludes a day, and a malformed setting is a fault naming its key', async () => {
    const m = await kit({ joined: null }).month('u1', '2026-10');
    expect(m.counts.BEFORE_JOINING).toBe(0);
    await expect(kit({ config: { ABSENT_DEDUCTS_SALARY: 'yes' } }).month('u1', '2026-10')).rejects.toMatchObject({ statusCode: 500 });
  });
});
