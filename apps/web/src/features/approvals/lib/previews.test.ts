import type { LeaveBalanceDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { balanceForLeave, balanceNote, daysLabel, leaveRangeLabel } from './previews';

describe('leaveRangeLabel', () => {
  it('shows one day, and a half day with which half', () => {
    expect(leaveRangeLabel('2026-10-03', '2026-10-03', null)).toBe('3 Oct 2026');
    expect(leaveRangeLabel('2026-10-03', '2026-10-03', 'FIRST')).toBe('3 Oct 2026 (first half)');
    expect(leaveRangeLabel('2026-10-03', '2026-10-03', 'SECOND')).toBe('3 Oct 2026 (second half)');
  });
  it('compresses a range inside one month', () => {
    expect(leaveRangeLabel('2026-10-03', '2026-10-05', null)).toBe('3 – 5 Oct 2026');
  });
  it('spells out a range that crosses a month or a year', () => {
    expect(leaveRangeLabel('2026-10-30', '2026-11-02', null)).toBe('30 Oct 2026 – 2 Nov 2026');
    expect(leaveRangeLabel('2026-12-30', '2027-01-02', null)).toBe('30 Dec 2026 – 2 Jan 2027');
  });
});

describe('daysLabel', () => {
  it('uses the singular for exactly one', () => {
    expect(daysLabel(1)).toBe('1 day');
    expect(daysLabel(0.5)).toBe('0.5 days');
    expect(daysLabel(3)).toBe('3 days');
  });
});

describe('balanceForLeave / balanceNote', () => {
  const balance = (over: Partial<LeaveBalanceDto> = {}): LeaveBalanceDto => ({
    id: 'b1',
    userId: 'u1',
    leaveTypeId: 't1',
    leaveTypeName: 'Casual',
    year: 2026,
    allocatedDays: 12,
    usedDays: 4,
    pendingDays: 3,
    availableDays: 5,
    ...over,
  });
  const leave = (over: Partial<Parameters<typeof balanceNote>[0]> = {}) => ({ isPaid: true, status: 'SUBMITTED', daysCount: 3, ...over });

  it('finds the balance of the leave’s own type, or none', () => {
    expect(balanceForLeave([balance()], { leaveTypeId: 't1' })?.id).toBe('b1');
    expect(balanceForLeave([balance()], { leaveTypeId: 'other' })).toBeNull();
  });
  it('says an open leave is already held, and what will be left', () => {
    expect(balanceNote(leave(), balance())).toBe('Already held against the balance. 5 days will be left if it is approved.');
    expect(balanceNote(leave({ status: 'MANAGER_APPROVED' }), balance({ availableDays: 1 }))).toMatch(/1 day will be left/);
  });
  it('says what is available for a decided leave', () => {
    expect(balanceNote(leave({ status: 'APPROVED' }), balance())).toBe('5 days available now.');
  });
  it('warns when the balance would go below zero', () => {
    expect(balanceNote(leave(), balance({ availableDays: -2 }))).toBe('This takes the balance 2 days below zero.');
  });
  it('says an unpaid leave uses no balance, and handles a missing row', () => {
    expect(balanceNote(leave({ isPaid: false }), null)).toMatch(/Unpaid leave/);
    expect(balanceNote(leave(), null)).toBe('No balance row for this leave type and year.');
  });
});
