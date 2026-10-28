import { DEFAULT_WEEKLY_OFF_SCHEDULE } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { planWeeklyOffSchedule } from './weeklyOffScheduleMigration.js';

describe('planWeeklyOffSchedule', () => {
  it('writes a non-Sunday old day as the first set, from the beginning of time', () => {
    expect(planWeeklyOffSchedule('friday', DEFAULT_WEEKLY_OFF_SCHEDULE)).toEqual({
      action: 'replace',
      value: '[{"effectiveFrom":"1970-01-01","rules":[{"weekday":"FRIDAY","weeks":"ALL"}]}]',
      reason: expect.any(String),
    });
  });
  it('does nothing for Sunday, a missing old day, or a bad one', () => {
    for (const old of ['SUNDAY', null, 'APRIL']) expect(planWeeklyOffSchedule(old, DEFAULT_WEEKLY_OFF_SCHEDULE).action, String(old)).toBe('none');
  });
  it('leaves an edited schedule alone, and a missing one for the seed', () => {
    expect(planWeeklyOffSchedule('FRIDAY', '[{"effectiveFrom":"2026-11-01","rules":[]}]').action).toBe('none');
    expect(planWeeklyOffSchedule('FRIDAY', null).action).toBe('none');
  });
  it('is idempotent: once replaced, a second run sees an edited schedule', () => {
    const first = planWeeklyOffSchedule('FRIDAY', DEFAULT_WEEKLY_OFF_SCHEDULE);
    expect(first.action === 'replace' && planWeeklyOffSchedule('FRIDAY', first.value).action).toBe('none');
  });
});
