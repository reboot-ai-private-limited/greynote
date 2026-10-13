import type { ExpenseOverviewRowDto, ExpenseReviewDayDto, ExpenseStageDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';

export type MonthStatus = ExpenseOverviewRowDto['status'];

/** Where an employee's month stands, in the words the reviewer uses. */
export const MONTH_STATUS_LABEL: Record<MonthStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  DRAFT: 'Not submitted',
  SUBMITTED: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Sent back',
};
export const MONTH_STATUS_TONE: Record<MonthStatus, BadgeTone> = {
  NOT_SUBMITTED: 'neutral',
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

/** Where a month stands for the people who run it, from the employee's status to Finalized (locked, payable) and Paid. */
export const STAGE_LABEL: Record<ExpenseStageDto, string> = {
  ...MONTH_STATUS_LABEL,
  FINALIZED: 'Finalized',
  PAID: 'Paid',
};
export const STAGE_TONE: Record<ExpenseStageDto, BadgeTone> = {
  ...MONTH_STATUS_TONE,
  FINALIZED: 'accent',
  PAID: 'success',
};

/** A month the Accountant can finalize: approved, and not yet finalized. */
export const canFinalize = (stage: ExpenseStageDto): boolean => stage === 'APPROVED';

export const DAY_TYPE_LABEL: Record<ExpenseReviewDayDto['dayType'], string> = {
  WORKING: 'Working day',
  WEEKLY_OFF: 'Weekly off',
  HOLIDAY: 'Holiday',
  LEAVE: 'Leave',
};

export const WORKING_TYPE_LABEL: Record<NonNullable<ExpenseReviewDayDto['workingType']>, string> = {
  FIELD_WORK: 'Field work',
  DOCTOR_CAMPAIGN: 'Doctor campaign',
  MEETING: 'Meeting',
  CONFERENCE: 'Conference',
  STRIKE: 'Strike',
};

export const STATION_LABEL: Record<NonNullable<ExpenseReviewDayDto['station']>, string> = {
  HQ: 'HQ',
  EX_STATION: 'Ex-station',
  OUT_STATION: 'Out-station',
};

export const DAY_KIND_LABEL: Record<NonNullable<ExpenseReviewDayDto['dayKind']>, string> = {
  NORMAL: '',
  STAY: 'Stay day',
  TRANSIT: 'Transit day',
};

export const DCR_LABEL: Record<ExpenseReviewDayDto['dcr'], string> = {
  NOT_SUBMITTED: 'Not submitted',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
export const DCR_TONE: Record<ExpenseReviewDayDto['dcr'], BadgeTone> = {
  NOT_SUBMITTED: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

/** A leave day, as the reviewer reads it: "Paid leave", "Unpaid leave", "Half day, unpaid leave". */
export function leaveLabel(leave: NonNullable<ExpenseReviewDayDto['leave']>): string {
  return `${leave.portion < 1 ? 'Half day, ' : ''}${leave.paid ? 'paid' : 'unpaid'} leave`.replace(/^./, (c) => c.toUpperCase());
}

/**
 * A working day on which the employee should have sent a daily report but has not: nothing was reported, so nothing is claimed.
 * Days off and leave are not a miss; neither is a meeting, conference or strike day with no calls to report.
 */
export function isMissedReport(day: Pick<ExpenseReviewDayDto, 'dayType' | 'dcr' | 'workingType'>): boolean {
  return day.dayType === 'WORKING' && day.dcr === 'NOT_SUBMITTED';
}

/** The month's totals row of the table: what is claimed, accepted and paid across the people listed. */
export function overviewTotals(rows: readonly ExpenseOverviewRowDto[]): { claimedPaise: number; acceptedPaise: number; paidPaise: number; waiting: number; notSubmitted: number; toFinalize: number } {
  const t = { claimedPaise: 0, acceptedPaise: 0, paidPaise: 0, waiting: 0, notSubmitted: 0, toFinalize: 0 };
  for (const r of rows) {
    t.claimedPaise += r.totalPaise;
    t.acceptedPaise += r.acceptedPaise;
    t.paidPaise += r.paidPaise;
    if (r.stage === 'SUBMITTED') t.waiting += 1;
    if (canFinalize(r.stage)) t.toFinalize += 1;
    if (r.stage === 'NOT_SUBMITTED' || r.stage === 'DRAFT') t.notSubmitted += 1;
  }
  return t;
}
