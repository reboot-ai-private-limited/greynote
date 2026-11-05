/**
 * The one approval kind for secondary sales (decision-log 2026-11-05). Two records live under it, both approved by the submitter's manager (Admin if
 * none): an MR's month of per-distributor stock, `mrUserId:month`, and a manager's team report, `managerUserId:month:team`.
 */
export const SECONDARY_SALES_KIND = 'SECONDARY_SALES';
export const mrReportRecordId = (userId: string, month: string): string => `${userId}:${month}`;
export const teamReportRecordId = (userId: string, month: string): string => `${userId}:${month}:team`;
/** `userId` and `month` of a record, and whether it is a manager's team report. */
export function parseSecondaryRecord(recordId: string): { userId: string; month: string; team: boolean } | null {
  const [userId, month, tail] = recordId.split(':');
  if (!userId || !month) return null;
  return { userId, month, team: tail === 'team' };
}
