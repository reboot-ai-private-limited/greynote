import type { AttendanceDayDto, DayStatus } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { financialYearRange } from '@/lib/financial-year';

export const STATUS_LABEL: Record<DayStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  STRIKE: 'Strike',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
  NOT_YET: 'Not yet',
  BEFORE_JOINING: 'Before joining',
};

/** One letter on the cell, so a day never depends on colour alone. */
export const STATUS_CODE: Record<DayStatus, string> = { PRESENT: 'P', ABSENT: 'A', LEAVE: 'L', STRIKE: 'S', HOLIDAY: 'H', WEEKLY_OFF: 'O', NOT_YET: '', BEFORE_JOINING: '' };

export const STATUS_TONE: Record<DayStatus, BadgeTone> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LEAVE: 'accent',
  STRIKE: 'warning',
  HOLIDAY: 'neutral',
  WEEKLY_OFF: 'neutral',
  NOT_YET: 'neutral',
  BEFORE_JOINING: 'neutral',
};

/** The order the legend and the counts are shown in. */
export const STATUS_ORDER: readonly DayStatus[] = ['PRESENT', 'ABSENT', 'LEAVE', 'STRIKE', 'HOLIDAY', 'WEEKLY_OFF'];

/** Cell classes by tone — colour plus the letter; a day that has not counted yet stays plain. */
export const CELL_CLASS: Record<DayStatus, string> = {
  PRESENT: 'bg-success-bg text-success-fg',
  ABSENT: 'bg-danger-bg text-danger-fg',
  LEAVE: 'bg-accent-soft text-accent-soft-text',
  STRIKE: 'bg-warning-bg text-warning-fg',
  HOLIDAY: 'bg-surface-hover text-text-muted',
  WEEKLY_OFF: 'bg-surface-subtle text-text-subtle',
  NOT_YET: 'text-text-subtle',
  BEFORE_JOINING: 'text-text-subtle',
};

/** How many blank columns come before the 1st when the week starts on Monday: 0 for a Monday, 6 for a Sunday. */
export function leadingBlanks(firstDate: string): number {
  return (new Date(`${firstDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** A payroll-calendar row's statuses paired with their dates. */
export function zipDays(dates: readonly string[], statuses: readonly DayStatus[]): AttendanceDayDto[] {
  return dates.flatMap((date, i) => (statuses[i] ? [{ date, status: statuses[i] }] : []));
}

/**
 * The months of a financial year up to and including the current one, newest first: the calendars are scoped to the year in view and the
 * server refuses a month outside it, and the month in progress is worth looking at (unlike payroll, which waits for a month to end).
 */
export function monthsInYear(year: number, today: string): string[] {
  const start = financialYearRange(year).from.slice(0, 7);
  const current = today.slice(0, 7);
  const out: string[] = [];
  let [y = 0, m = 1] = start.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month <= current) out.push(month);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}

/** "3 days would be deducted from salary", or the reason nothing would be. */
export function deductionNote(p: { deductibleDays: number; absentDays: number; absentDeducts: boolean }): string {
  if (!p.absentDeducts) return p.absentDays > 0 ? `${p.absentDays} absent ${p.absentDays === 1 ? 'day' : 'days'}, not deducted: absent days are switched off in the settings.` : 'Absent days are switched off in the settings; nothing is deducted.';
  if (p.deductibleDays === 0) return 'Nothing would be deducted from salary.';
  return `${p.deductibleDays} ${p.deductibleDays === 1 ? 'day' : 'days'} would be deducted from salary, like unpaid leave.`;
}
