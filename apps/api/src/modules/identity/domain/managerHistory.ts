/**
 * Every change of an employee's manager, dated by the month it takes effect, so a report for a past month can use the team
 * as it was then (decision-log 2026-10-06, K18). Append-only. A change made by editing the profile takes the whole month it is
 * made in; one made by a promotion takes the promotion's month; a bulk move takes the month it is made in.
 */
export type ManagerChangeSource = 'PROFILE_EDIT' | 'PROMOTION' | 'BULK_REASSIGN';

export interface ManagerChange {
  id: string;
  userId: string;
  /** The manager from `effectiveFrom` on; null when the manager was cleared. */
  managerId: string | null;
  /** Who it was before, so the months before the first recorded change can still be answered. */
  previousManagerId: string | null;
  /** `YYYY-MM`. */
  effectiveFrom: string;
  source: ManagerChangeSource;
  promotionId: string | null;
  createdBy: string | null;
  createdAt: Date;
}

/**
 * Who the employee reported to in `month`. With no recorded change that is simply the current manager; otherwise the latest
 * change not after the month (ties go to the one saved last), or, before the first change, who it was before it.
 */
export function managerAsOf(changes: readonly ManagerChange[], currentManagerId: string | null, month: string): string | null {
  if (changes.length === 0) return currentManagerId;
  const ordered = [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.getTime() - b.createdAt.getTime());
  let found: ManagerChange | undefined;
  for (const c of ordered) if (c.effectiveFrom <= month) found = c;
  return found ? found.managerId : ordered[0]!.previousManagerId;
}
