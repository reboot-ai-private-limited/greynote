import { describe, expect, it } from 'vitest';
import {
  assertTimeZone,
  businessDate,
  dailyPlanDeadline,
  monthlyPlanDeadline,
  parseCalendarDate,
  parseTimeOfDay,
} from './businessTime.js';

const IST = 'Asia/Kolkata';

describe('businessDate', () => {
  it('rolls over at midnight in the business timezone, not UTC', () => {
    expect(businessDate(new Date('2026-10-04T18:29:59Z'), IST)).toBe('2026-10-04');
    expect(businessDate(new Date('2026-10-04T18:30:00Z'), IST)).toBe('2026-10-05');
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
