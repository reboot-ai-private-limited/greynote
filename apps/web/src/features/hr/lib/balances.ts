import type { LeaveBalanceDto } from '@greynote/contracts';
import { daysError, formatDays } from './days';

/** Pending days are held for open requests, so the floor for an allocation is what is used plus what is waiting. */
export function allocationFloor(b: Pick<LeaveBalanceDto, 'usedDays' | 'pendingDays'>): number {
  return b.usedDays + b.pendingDays;
}

/** A new allocation: whole or half days, within the ceiling, and never below the days already used or waiting for approval. */
export function allocationError(raw: string, balance: Pick<LeaveBalanceDto, 'usedDays' | 'pendingDays'>): string | undefined {
  const problem = daysError(raw);
  if (problem) return problem;
  const floor = allocationFloor(balance);
  return Number(raw.trim()) < floor
    ? `${formatDays(floor)} ${floor === 1 ? 'day is' : 'days are'} already used or waiting for approval, so the allocation cannot be lower.`
    : undefined;
}

export const REASON_MAX = 500;

export function adjustReasonError(reason: string): string | undefined {
  const t = reason.trim();
  if (t === '') return 'A reason is required.';
  return t.length > REASON_MAX ? `Keep the reason to ${REASON_MAX} characters.` : undefined;
}

/** What the change does, said before it is made: `12 → 15 days (+3)`. */
export function adjustPreview(from: number, to: number): string {
  const diff = to - from;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  return `${formatDays(from)} → ${formatDays(to)} days (${sign}${formatDays(Math.abs(diff))})`;
}
