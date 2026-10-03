import type { LeaveBalanceDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { balanceForLeave, balanceNote, serviceOriginLabel, serviceTypeLabel } from './previews';

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

describe('doctor service labels', () => {
  it('names the known types and shows an unknown one as stored', () => {
    expect(serviceTypeLabel('TOUR_PACKAGE')).toBe('Tour package');
    expect(serviceTypeLabel('ONLINE_PROMOTION')).toBe('Online promotion');
    expect(serviceTypeLabel('OTHERS')).toBe('Other');
    expect(serviceTypeLabel('SPONSORED_LUNCH')).toBe('SPONSORED_LUNCH');
  });
  it('says who made it', () => {
    expect(serviceOriginLabel('MR')).toBe('Requested by the MR');
    expect(serviceOriginLabel('ADMIN')).toBe('Recorded by Admin');
  });
});
