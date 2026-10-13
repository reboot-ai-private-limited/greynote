import { describe, expect, it } from 'vitest';
import { isMissedReport, leaveLabel, MONTH_STATUS_LABEL, overviewTotals } from './expenseMonths';

describe('leaveLabel', () => {
  it('says whether the leave is paid, and a half day', () => {
    expect(leaveLabel({ paid: true, portion: 1, leaveType: 'Casual' })).toBe('Paid leave');
    expect(leaveLabel({ paid: false, portion: 1, leaveType: null })).toBe('Unpaid leave');
    expect(leaveLabel({ paid: false, portion: 0.5, leaveType: null })).toBe('Half day, unpaid leave');
  });
});

describe('isMissedReport', () => {
  it('is a working day with no report, nothing else', () => {
    expect(isMissedReport({ dayType: 'WORKING', dcr: 'NOT_SUBMITTED', workingType: null })).toBe(true);
    expect(isMissedReport({ dayType: 'WORKING', dcr: 'SUBMITTED', workingType: 'FIELD_WORK' })).toBe(false);
    expect(isMissedReport({ dayType: 'LEAVE', dcr: 'NOT_SUBMITTED', workingType: null })).toBe(false);
    expect(isMissedReport({ dayType: 'WEEKLY_OFF', dcr: 'NOT_SUBMITTED', workingType: null })).toBe(false);
  });
});

describe('overviewTotals', () => {
  it('adds the money and counts who is waiting and who has not sent a month', () => {
    const row = (over: object) => ({ userId: 'u', userName: 'n', employeeCode: 'c', taPaise: 0, daPaise: 0, otherPaise: 0, totalPaise: 0, acceptedPaise: 0, paidPaise: 0, status: 'NOT_SUBMITTED', submittedAt: null, flaggedRows: 0, ...over }) as never;
    const t = overviewTotals([row({ totalPaise: 1000, acceptedPaise: 800, paidPaise: 500, status: 'SUBMITTED' }), row({ totalPaise: 200 }), row({ status: 'DRAFT' }), row({ status: 'APPROVED', totalPaise: 50, acceptedPaise: 50 })]);
    expect(t).toEqual({ claimedPaise: 1250, acceptedPaise: 850, paidPaise: 500, waiting: 1, notSubmitted: 2 });
  });
});

describe('MONTH_STATUS_LABEL', () => {
  it('reads a draft the same as a month never sent', () => {
    expect(MONTH_STATUS_LABEL.DRAFT).toBe(MONTH_STATUS_LABEL.NOT_SUBMITTED);
  });
});
