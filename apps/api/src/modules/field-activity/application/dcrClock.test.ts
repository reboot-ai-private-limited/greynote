import { describe, expect, it } from 'vitest';
import { DcrClock } from './dcrClock.js';

const clockAt = (iso: string, dayStart?: string) =>
  new DcrClock({ get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', ...(dayStart && { DAY_START_TIME: dayStart }) })[key] ?? '' }, () => new Date(iso));

describe('DcrClock with a business day start', () => {
  it('keeps 01:30 IST on the 11th in the 10th when the day starts at 02:00, and opens the 11th at 02:00', async () => {
    expect(await clockAt('2026-10-10T20:00:00Z', '02:00').today()).toBe('2026-10-10'); // 01:30 IST on the 11th
    expect(await clockAt('2026-10-10T20:30:00Z', '02:00').today()).toBe('2026-10-11'); // 02:00 IST
  });

  it('behaves as before when the setting is absent or 00:00', async () => {
    expect(await clockAt('2026-10-10T20:00:00Z').today()).toBe('2026-10-11');
    expect(await clockAt('2026-10-10T20:00:00Z', '00:00').today()).toBe('2026-10-11');
  });

  it('sorts an instant into its business day, and a month ends at the next 02:00 on the 1st', async () => {
    const clock = clockAt('2026-10-10T00:00:00Z', '02:00');
    expect(await clock.dateOf(new Date('2026-09-30T20:00:00Z'))).toBe('2026-09-30'); // 01:30 IST on 1 Oct
    const { from, to } = await clock.monthRange('2026-09');
    expect(from.toISOString()).toBe('2026-08-31T20:30:00.000Z'); // 02:00 IST 1 Sep
    expect(to.toISOString()).toBe('2026-09-30T20:30:00.000Z'); // 02:00 IST 1 Oct
  });

  it('does not shift a date of record such as the joining date', async () => {
    expect(await clockAt('2026-10-10T00:00:00Z', '02:00').calendarDateOf(new Date('2026-09-30T19:00:00Z'))).toBe('2026-10-01'); // 00:30 IST on 1 Oct
  });
});
