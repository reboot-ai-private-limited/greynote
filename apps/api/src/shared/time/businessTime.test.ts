import { describe, expect, it } from 'vitest';
import {
  addDays,
  assertTimeZone,
  businessDate,
  dailyPlanDeadline,
  dayStartInstant,
  eachDate,
  leaveYearOf,
  leaveYearRange,
  monthlyPlanDeadline,
  parseCalendarDate,
  parseMonthName,
  parseTimeOfDay,
  parseWeekdayName,
  weekdayOf,
} from './businessTime.js';

const IST = 'Asia/Kolkata';

describe('businessDate', () => {
  it('rolls over at midnight in the business timezone, not UTC', () => {
    expect(businessDate(new Date('2026-10-04T18:29:59Z'), IST)).toBe('2026-10-04');
    expect(businessDate(new Date('2026-10-04T18:30:00Z'), IST)).toBe('2026-10-05');
  });

  it('rolls over at the configured day start instead of midnight', () => {
    // 01:59 IST on the 5th is still the 4th with a 02:00 day start; 02:00 opens the 5th.
    expect(businessDate(new Date('2026-10-04T20:29:00Z'), IST, '02:00')).toBe('2026-10-04');
    expect(businessDate(new Date('2026-10-04T20:30:00Z'), IST, '02:00')).toBe('2026-10-05');
  });

  it('puts the small hours of the 1st into the previous month and year', () => {
    expect(businessDate(new Date('2026-09-30T20:00:00Z'), IST, '02:00')).toBe('2026-09-30');
    expect(businessDate(new Date('2026-12-31T20:00:00Z'), IST, '02:00')).toBe('2026-12-31');
  });

  it('defaults to midnight', () => {
    expect(businessDate(new Date('2026-10-04T20:00:00Z'), IST)).toBe('2026-10-05');
  });
});

describe('dayStartInstant', () => {
  it('is the day-start wall time on that date', () => {
    expect(dayStartInstant({ year: 2026, month: 10, day: 5 }, '02:00', IST).toISOString()).toBe('2026-10-04T20:30:00.000Z');
  });
});

describe('dailyPlanDeadline', () => {
  it('is the cutoff time on the plan date, in IST', () => {
    const deadline = dailyPlanDeadline('2026-10-05', '10:00', IST);
    expect(deadline.toISOString()).toBe('2026-10-05T04:30:00.000Z');
    expect(new Date('2026-10-05T04:29:00Z') > deadline).toBe(false); // 09:59 IST
    expect(new Date('2026-10-05T04:31:00Z') > deadline).toBe(true); // 10:01 IST
  });

  it('follows a DST zone across its change', () => {
    // London is UTC+1 in summer, UTC+0 after the last Sunday of October.
    expect(dailyPlanDeadline('2026-07-01', '10:00', 'Europe/London').toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(dailyPlanDeadline('2026-11-02', '10:00', 'Europe/London').toISOString()).toBe('2026-11-02T10:00:00.000Z');
  });
});

describe('monthlyPlanDeadline', () => {
  it('is the end of the cutoff day in the month before', () => {
    expect(monthlyPlanDeadline('2026-10', 28, IST).toISOString()).toBe('2026-09-28T18:29:59.999Z');
  });

  it('crosses the year for January', () => {
    expect(monthlyPlanDeadline('2027-01', 28, IST).toISOString()).toBe('2026-12-28T18:29:59.999Z');
  });

  it('clamps a day past the month end to its last day', () => {
    expect(monthlyPlanDeadline('2027-03', 30, IST).toISOString()).toBe('2027-02-28T18:29:59.999Z');
    expect(monthlyPlanDeadline('2028-03', 30, IST).toISOString()).toBe('2028-02-29T18:29:59.999Z');
  });
});

describe('malformed values', () => {
  it('throws a RangeError', () => {
    expect(() => parseTimeOfDay('10am')).toThrow(RangeError);
    expect(() => parseTimeOfDay('24:00')).toThrow(RangeError);
    expect(() => parseCalendarDate('2026-02-30')).toThrow(RangeError);
    expect(() => monthlyPlanDeadline('2026-10', 0, IST)).toThrow(RangeError);
    expect(() => assertTimeZone('Mars/Olympus')).toThrow(RangeError);
  });
});

describe('calendar helpers', () => {
  it('adds days and walks a range across a month end and a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(eachDate('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(eachDate('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('names weekdays', () => {
    expect(weekdayOf('2026-09-27')).toBe('SUNDAY');
    expect(weekdayOf('2026-09-28')).toBe('MONDAY');
  });

  it('places dates in their leave year', () => {
    expect(leaveYearOf('2027-03-31', 4)).toBe(2026);
    expect(leaveYearOf('2027-04-01', 4)).toBe(2027);
    expect(leaveYearOf('2026-12-31', 1)).toBe(2026);
    expect(leaveYearRange(2026, 4)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(leaveYearRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('parses month and weekday names', () => {
    expect(parseMonthName('APRIL')).toBe(4);
    expect(() => parseMonthName('April')).toThrow(RangeError);
    expect(parseWeekdayName('SUNDAY')).toBe('SUNDAY');
    expect(() => parseWeekdayName('SUN')).toThrow(RangeError);
  });
});
