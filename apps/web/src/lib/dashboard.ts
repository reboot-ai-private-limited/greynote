import type { RoleName } from '@greynote/contracts';

/**
 * Pure rules for the dashboards, kept React-free so they can be tested in Node.
 */

/** A capped list's count: at the cap the true figure is unknown, so say so rather than lie. */
export function capLabel(count: number, cap: number): string {
  return count >= cap ? `${cap}+` : String(count);
}

export function sumPaise(rows: readonly { amountPaise: number }[]): number {
  return rows.reduce((total, row) => total + row.amountPaise, 0);
}

/** The `n` items that have waited longest, by an ISO timestamp field. */
export function longestWaiting<T>(items: readonly T[], at: (item: T) => string, n: number): T[] {
  return [...items].sort((a, b) => at(a).localeCompare(at(b))).slice(0, n);
}

export type CardId =
  | 'approvals'
  | 'devices'
  | 'employees'
  | 'missingStock'
  | 'leaveApprovals'
  | 'onLeaveToday'
  | 'unpaidExpenses'
  | 'payroll';

/**
 * Which cards each role sees, in order. Mirrors what the API lets each role call — an
 * ACCOUNTANT gets 403 on the approvals inbox and the users list, HR on monthly stock.
 */
export function cardsForRole(role: RoleName): readonly CardId[] {
  switch (role) {
    case 'ADMIN':
      return ['approvals', 'devices', 'employees', 'missingStock'];
    case 'HR':
      return ['leaveApprovals', 'employees', 'onLeaveToday'];
    case 'ACCOUNTANT':
      return ['unpaidExpenses', 'payroll'];
    default:
      return [];
  }
}

/** Gaps with no endpoint yet. Shown as disabled tiles — never hidden, never faked. */
export function comingSoonForRole(role: RoleName): readonly string[] {
  switch (role) {
    case 'ADMIN':
      return ['Blocked employees', 'Missed DCRs'];
    case 'HR':
      return ['Blocked employees'];
    default:
      return [];
  }
}
