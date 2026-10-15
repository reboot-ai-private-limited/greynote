import { describe, expect, it } from 'vitest';
import { dailyStages, dueStages, periodStages } from './stages.js';
import { addMonths, clampedDate } from './months.js';

const TZ = 'Asia/Kolkata';
// 10:00 IST on 15 Oct 2026
const DEADLINE = new Date('2026-10-15T04:30:00.000Z');
const at = (iso: string) => new Date(iso);
const daily = () => dailyStages(DEADLINE, { firstMinutes: 120, secondMinutes: 30, afterMinutes: 30 });

describe('daily plan stages', () => {
  it('is quiet before the first mark', () => {
    expect(dueStages(daily(), 'EMPLOYEE', at('2026-10-15T02:29:00Z'))).toBeNull();
  });

  it('sends the first reminder two hours ahead, the second 30 minutes ahead, then "missed"', () => {
    expect(dueStages(daily(), 'EMPLOYEE', at('2026-10-15T02:31:00Z'))?.send.id).toBe('EMPLOYEE:first');
    expect(dueStages(daily(), 'EMPLOYEE', at('2026-10-15T04:05:00Z'))?.send.id).toBe('EMPLOYEE:second');
    expect(dueStages(daily(), 'EMPLOYEE', at('2026-10-15T04:31:00Z'))?.send.id).toBe('EMPLOYEE:missed');
  });

  it('after a late start sends only the latest due stage but still reports the earlier ones to claim', () => {
    const due = dueStages(daily(), 'EMPLOYEE', at('2026-10-15T04:10:00Z'));
    expect(due?.send.id).toBe('EMPLOYEE:second');
    expect(due?.all.map((s) => s.id)).toEqual(['EMPLOYEE:first', 'EMPLOYEE:second']);
  });

  it('tells the manager two hours ahead and 30 minutes after the deadline, nothing at the deadline itself', () => {
    expect(dueStages(daily(), 'MANAGER', at('2026-10-15T03:00:00Z'))?.send.id).toBe('MANAGER:first');
    expect(dueStages(daily(), 'MANAGER', at('2026-10-15T04:40:00Z'))).toBeNull();
    expect(dueStages(daily(), 'MANAGER', at('2026-10-15T05:01:00Z'))?.send.id).toBe('MANAGER:after');
  });

  it('stops after six hours', () => {
    expect(dueStages(daily(), 'MANAGER', at('2026-10-15T11:00:00Z'))).toBeNull();
  });
});

describe('period stages (monthly plan, expenses, stock)', () => {
  // Deadline: end of 28 Oct 2026 IST
  const deadline = new Date('2026-10-28T18:29:59.999Z');
  const stages = () => periodStages('2026-10-28', deadline, { firstDays: 3, secondDays: 1, sendTime: '10:30' }, TZ);

  it('reminds at 10:30 three days and one day before, and the morning after', () => {
    const byId = Object.fromEntries(stages().map((s) => [s.id, s.at.toISOString()]));
    expect(byId['EMPLOYEE:first']).toBe('2026-10-25T05:00:00.000Z');
    expect(byId['EMPLOYEE:second']).toBe('2026-10-27T05:00:00.000Z');
    expect(byId['EMPLOYEE:after']).toBe('2026-10-29T05:00:00.000Z');
  });

  it('does not remind after the deadline for the before-stages', () => {
    expect(dueStages(stages(), 'MANAGER', at('2026-10-28T19:00:00Z'))).toBeNull();
  });

  it('can be limited to one audience', () => {
    const only = periodStages('2026-10-28', deadline, { firstDays: 3, secondDays: 1, sendTime: '10:30' }, TZ, ['EMPLOYEE']);
    expect(only.every((s) => s.audience === 'EMPLOYEE')).toBe(true);
  });
});

describe('month helpers', () => {
  it('shifts across year ends', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });
  it('clamps a day to a short month', () => {
    expect(clampedDate('2027-02', 30)).toBe('2027-02-28');
  });
});
