/**
 * Sales' narrow view of Late Grants: has Admin (or the manager) let this employee enter a closed month's stock counts or secondary
 * sales (and their files)? Not spent by use — the exception simply lasts until it ends, since a month is many entries.
 */
export interface SalesLateGate {
  hasUsable(userId: string, kind: 'MONTHLY_STOCK' | 'SECONDARY_SALES', month: string): Promise<boolean>;
}
