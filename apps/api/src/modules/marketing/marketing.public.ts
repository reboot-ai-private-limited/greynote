import type { TargetShareRow, TargetSummary } from './application/usecases/targets.usecase.js';

export type { TargetShareRow, TargetSummary } from './application/usecases/targets.usecase.js';

/**
 * The only thing another module may import from `marketing/`. Months are `YYYY-MM`; money is whole paise. Nothing
 * consumes Marketing yet (Payroll does not read it), so the contract starts with the one read the Team tab needs.
 */
export interface MarketingPublicContract {
  /** A user's effective target and achievement for a month — the general target, or narrowed to a Product and/or Campaign. */
  getTargetSummary(userId: string, scope: { month: string; productId?: string | null; campaignId?: string | null }): Promise<TargetSummary>;
  /** The general (no campaign) targets of these users that touch `fromMonth`–`toMonth`, each with the share of it inside that range — the Sales Dashboard's and employee view's read. */
  listTargetShares(userIds: string[], fromMonth: string, toMonth: string): Promise<TargetShareRow[]>;
  /** How many visuals are picked to show this doctor now: for its deactivate/delete warning. */
  countDoctorVisuals(doctorId: string): Promise<number>;
  /** A leaver's targets that run past the month of their last working day. */
  countLeaverTargets(userId: string, lastWorkingDay: string): Promise<number>;
  /** Cuts those at the leaving month (keeping their share of it) and removes the ones that start later. Safe to run again. */
  cutLeaverTargets(userId: string, lastWorkingDay: string, actorId: string): Promise<{ cut: number; removed: number }>;
}
