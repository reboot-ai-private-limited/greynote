import { describe, expect, it } from 'vitest';
import { classifyDay, countStatuses, deductibleDays, isDeductible, type DayFacts } from './dayStatus.js';

const base: DayFacts = { date: '2026-10-05', today: '2026-10-20', joinedOn: '2026-01-01', holiday: false, weeklyOff: false, onLeave: false, strikePlan: false, reported: false };
const day = (over: Partial<DayFacts>) => classifyDay({ ...base, ...over });

describe('classifyDay', () => {
  it('a plain working day with a report is present, without one absent', () => {
    expect(day({ reported: true })).toBe('PRESENT');
    expect(day({})).toBe('ABSENT');
  });

  it('first match wins: holiday, then weekly off, then leave, then strike, then present', () => {
    const everything = { holiday: true, weeklyOff: true, onLeave: true, strikePlan: true, reported: true };
    expect(day(everything)).toBe('HOLIDAY');
    expect(day({ ...everything, holiday: false })).toBe('WEEKLY_OFF');
    expect(day({ ...everything, holiday: false, weeklyOff: false })).toBe('LEAVE');
    expect(day({ ...everything, holiday: false, weeklyOff: false, onLeave: false })).toBe('STRIKE');
    expect(day({ ...everything, holiday: false, weeklyOff: false, onLeave: false, strikePlan: false })).toBe('PRESENT');
  });

  it('before joining and the future come first, even on a holiday', () => {
    expect(day({ date: '2025-12-31', holiday: true })).toBe('BEFORE_JOINING');
    expect(day({ date: '2026-10-21', holiday: true })).toBe('NOT_YET');
    expect(day({ date: '2026-10-21', reported: true })).toBe('NOT_YET');
  });

  it('the joining day itself counts', () => {
    expect(day({ date: '2026-01-01' })).toBe('ABSENT');
  });

  it('without a recorded joining date a would-be-absent day is unknown, never absent; every other status still applies', () => {
    expect(day({ joinedOn: null })).toBe('UNKNOWN');
    expect(day({ joinedOn: null, reported: true })).toBe('PRESENT');
    expect(day({ joinedOn: null, onLeave: true })).toBe('LEAVE');
    expect(day({ joinedOn: null, holiday: true })).toBe('HOLIDAY');
    expect(day({ joinedOn: null, date: base.today })).toBe('NOT_YET');
    expect(isDeductible('UNKNOWN', { absentDeducts: true, strikeDeducts: true })).toBe(false);
  });

  it('today is present with a report and not yet without one, never absent', () => {
    expect(day({ date: base.today, reported: true })).toBe('PRESENT');
    expect(day({ date: base.today })).toBe('NOT_YET');
    expect(day({ date: base.today, weeklyOff: true })).toBe('WEEKLY_OFF');
  });
});

describe('what costs salary', () => {
  const on = { absentDeducts: true, strikeDeducts: false };
  it('absent only, by default; strike only when its own switch is on', () => {
    expect(isDeductible('ABSENT', on)).toBe(true);
    expect(isDeductible('STRIKE', on)).toBe(false);
    expect(isDeductible('STRIKE', { absentDeducts: true, strikeDeducts: true })).toBe(true);
    for (const s of ['HOLIDAY', 'WEEKLY_OFF', 'LEAVE', 'PRESENT', 'NOT_YET', 'BEFORE_JOINING'] as const) expect(isDeductible(s, { absentDeducts: true, strikeDeducts: true })).toBe(false);
  });

  it('nothing is deducted when absent days are switched off, whatever the strike switch says', () => {
    expect(isDeductible('ABSENT', { absentDeducts: false, strikeDeducts: true })).toBe(false);
    expect(isDeductible('STRIKE', { absentDeducts: false, strikeDeducts: true })).toBe(false);
  });

  it('counts a month', () => {
    const statuses = ['PRESENT', 'PRESENT', 'ABSENT', 'ABSENT', 'STRIKE', 'LEAVE', 'HOLIDAY'] as const;
    expect(countStatuses(statuses)).toMatchObject({ PRESENT: 2, ABSENT: 2, STRIKE: 1, LEAVE: 1, HOLIDAY: 1, WEEKLY_OFF: 0 });
    expect(deductibleDays(statuses, on)).toBe(2);
    expect(deductibleDays(statuses, { absentDeducts: true, strikeDeducts: true })).toBe(3);
    expect(deductibleDays(statuses, { absentDeducts: false, strikeDeducts: false })).toBe(0);
  });
});
