import type { ApprovalSubject } from '../domain/approvalKind.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-22` → `22 Oct 2026`: the day a daily record is about. */
export function dayTitle(date: string): string {
  const [year, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/** `2026-11` → `Nov 2026`: the month a monthly record is about. */
export function monthTitle(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${year}`;
}

/**
 * A kind's `describeRecords` for records read one by one (a page is at most 100): each id the owner can find becomes a
 * subject, and one it cannot is left out, so its row shows by its kind alone.
 */
export function describeEach<T>(
  find: (id: string) => Promise<T | null>,
  subjectOf: (record: T) => ApprovalSubject,
): (recordIds: string[]) => Promise<Map<string, ApprovalSubject>> {
  return async (recordIds) => {
    const found = await Promise.all(
      recordIds.map(async (id) => {
        const record = await find(id);
        return record ? ([id, subjectOf(record)] as const) : null;
      }),
    );
    return new Map(found.filter((e) => e !== null));
  };
}
