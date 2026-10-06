import { buildApprovalContainer } from '@/modules/approval/approval.container.js';
import { buildConfigContainer } from '@/modules/config/config.container.js';
import { buildFieldActivityContainer } from '@/modules/field-activity/field-activity.container.js';
import { buildFieldMasterDataContainer } from '@/modules/field-master-data/field-master-data.container.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildHrContainer } from '@/modules/hr/hr.container.js';
import { buildIdentityContainer } from '@/modules/identity/identity.container.js';
import { buildMarketingContainer } from '@/modules/marketing/marketing.container.js';
import { buildPayrollContainer } from '@/modules/payroll/payroll.container.js';
import { buildPlanningContainer } from '@/modules/planning/planning.container.js';
import { buildSalesContainer } from '@/modules/sales/sales.container.js';
import { buildSyncContainer } from '@/modules/sync/sync.container.js';
import { registerCompositionSyncSources } from './syncSources.js';
import { buildTerritoryContainer } from '@/modules/territory/territory.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  config: ReturnType<typeof buildConfigContainer>;
  identity: ReturnType<typeof buildIdentityContainer>;
  territory: ReturnType<typeof buildTerritoryContainer>;
  approval: ReturnType<typeof buildApprovalContainer>;
  planning: ReturnType<typeof buildPlanningContainer>;
  hr: ReturnType<typeof buildHrContainer>;
  sync: ReturnType<typeof buildSyncContainer>;
  fieldActivity: ReturnType<typeof buildFieldActivityContainer>;
  fieldMasterData: ReturnType<typeof buildFieldMasterDataContainer>;
  sales: ReturnType<typeof buildSalesContainer>;
  marketing: ReturnType<typeof buildMarketingContainer>;
  payroll: ReturnType<typeof buildPayrollContainer>;
}

/**
 * Pure composition — no DB writes here. Seeding (SystemConfig defaults, the fixed Role rows, the
 * bootstrap Admin) is an explicit, operator-triggered action via `pnpm --filter @greynote/api
 * seed` (see `scripts/seed.ts`), not an implicit side effect of the server starting.
 */
export function buildContainers(): AppContainers {
  // Tier 0 — Health and Config depend on no other modules.
  const health = buildHealthContainer();
  const config = buildConfigContainer();

  // Tier 1 — Identity depends only on Config's public contract, per MODULE_TIERS.
  const identity = buildIdentityContainer(config.contract);

  // Tier 2 — Territory depends only on Identity's public contract (RouteAssignment's user checks).
  const territory = buildTerritoryContainer(identity.contract, config.contract);

  // Tier 2 — Approval reads Identity (who manages the submitter, right now) and Config (which
  // kinds skip the final stage).
  const approval = buildApprovalContainer(identity.contract, config.contract);

  // Tier 2 — Sync: the daily report's push. A registry — it knows no kind until an owning module
  // registers one, so it needs only Identity (who is sending) and Config (its limits).
  const sync = buildSyncContainer(identity.contract, config.contract);

  // Tier 3 — Planning: who the submitter and their managers are (Identity), which Routes they
  // cover (Territory), the approval workflow its Plans go through, and the deadlines (Config).
  const planning = buildPlanningContainer(identity.contract, territory.contract, approval.contract, sync.contract, config.contract);

  // Tier 3 — HR: employees and Pay Bands (Identity), their HQ (Territory), the LEAVE workflow
  // (Approval), the leave-year and weekly-off settings (Config).
  const hr = buildHrContainer(identity.contract, territory.contract, approval.contract, sync.contract, config.contract);

  // Tier 3 — Field Master Data: employees and their downline (Identity), the Routes Doctors and Chemists sit on and an MR covers (Territory), the NEW_DOCTOR workflow
  // (Approval), the daily report's push, where an offline-added Doctor arrives (Sync), and the visibility
  // and auto-assign switches (Config).
  const fieldMasterData = buildFieldMasterDataContainer(identity.contract, territory.contract, approval.contract, sync.contract, config.contract);

  // Tier 4 — Field Activity: the daily core (DCR, calls, expenses, TA/DA). It consumes almost everything below it.
  const fieldActivity = buildFieldActivityContainer(identity.contract, planning.contract, fieldMasterData.contract, territory.contract, approval.contract, sync.contract, hr.contract, config.contract);

  planning.bindDayReported((userId, date) => fieldActivity.contract.hasQualifyingDcr(userId, date));

  // Tier 4 — Sales & Orders: monthly stock counts at Chemists and Distributors (Field Master Data), who may see whose (Identity), the daily push (Sync).
  const sales = buildSalesContainer(identity.contract, fieldMasterData.contract, sync.contract, config.contract);

  // Tier 5 — Marketing: Visuals, Campaigns and Targets. Reads the downline (Identity), Products (Field Master Data) and order totals (Sales).
  const marketing = buildMarketingContainer(identity.contract, fieldMasterData.contract, sales.contract);

  // Tier 5 — Payroll: base salary and who is active (Identity), approved unpaid leave (HR), what was paid in the month (Field Activity).
  const payroll = buildPayrollContainer(identity.contract, hr.contract, config.contract);

  // HR sits below Payroll, so it asks through a port: once a month's salary is finalized, that employee's leave in the month is locked.
  hr.bindPayrollLock((userId, month) => payroll.contract.isMonthFinalized(userId, month));

  // Territory and Config sit at or below Sync's tier, so they can't register with it themselves; their
  // slices of the phone's cache are wired here, from their public contracts.
  registerCompositionSyncSources({ sync: sync.contract, territory: territory.contract, config: config.contract });

  return { health, config, identity, territory, approval, planning, hr, fieldMasterData, sync, fieldActivity, sales, marketing, payroll };
}
