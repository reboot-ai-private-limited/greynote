import type { LeaveBalanceDto, LeaveDetailDto } from '@greynote/contracts';

/** `3 Oct 2026` for one day, `3 – 5 Oct 2026` within a month, otherwise both ends in full. Dates arrive as `YYYY-MM-DD`. */
export function leaveRangeLabel(start: string, end: string, half: string | null): string {
  const fmt = (iso: string, withYear: boolean, withMonth = true) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'UTC',
      day: 'numeric',
      ...(withMonth && { month: 'short' }),
      ...(withYear && { year: 'numeric' }),
    }).format(new Date(`${iso}T00:00:00Z`));
  if (start === end) {
    const day = fmt(start, true);
    return half ? `${day} (${half === 'FIRST' ? 'first half' : 'second half'})` : day;
  }
  if (start.slice(0, 7) === end.slice(0, 7)) return `${fmt(start, false, false)} – ${fmt(end, true)}`;
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

/** The balance row of the leave's own type, for the leave year it falls in. An unpaid type has none. */
export function balanceForLeave(balances: readonly LeaveBalanceDto[], leave: Pick<LeaveDetailDto, 'leaveTypeId'>): LeaveBalanceDto | null {
  return balances.find((b) => b.leaveTypeId === leave.leaveTypeId) ?? null;
}

/** `1 day`, `2.5 days`. */
export function daysLabel(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * What the balance means for this request. While it is open its days are held in "pending", so "available" already
 * excludes them: that is what is left if it is approved. An unpaid leave touches no balance.
 */
export function balanceNote(leave: Pick<LeaveDetailDto, 'isPaid' | 'status' | 'daysCount'>, balance: LeaveBalanceDto | null): string {
  if (!leave.isPaid) return 'Unpaid leave: it uses no balance, and is deducted from pay.';
  if (!balance) return 'No balance row for this leave type and year.';
  if (balance.availableDays < 0) return `This takes the balance ${daysLabel(-balance.availableDays)} below zero.`;
  const open = leave.status === 'SUBMITTED' || leave.status === 'MANAGER_APPROVED';
  return open
    ? `Already held against the balance. ${daysLabel(balance.availableDays)} will be left if it is approved.`
    : `${daysLabel(balance.availableDays)} available now.`;
}
