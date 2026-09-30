import type { TargetSummary } from './application/usecases/targets.usecase.js';

export type { TargetSummary } from './application/usecases/targets.usecase.js';

/**
 * The only thing another module may import from `marketing/`. Months are `YYYY-MM`; money is whole paise. Nothing
 * consumes Marketing yet (Payroll does not read it), so the contract starts with the one read the Team tab needs.
 */
export interface MarketingPublicContract {
  /** A user's effective target and achievement for a month — the general target, or narrowed to a Product and/or Campaign. */
  getTargetSummary(userId: string, scope: { month: string; productId?: string | null; campaignId?: string | null }): Promise<TargetSummary>;
}
