import { buildApprovalContainer } from '@/modules/approval/approval.container.js';
import { buildConfigContainer } from '@/modules/config/config.container.js';
import { buildFieldMasterDataContainer } from '@/modules/field-master-data/field-master-data.container.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildHrContainer } from '@/modules/hr/hr.container.js';
import { buildIdentityContainer } from '@/modules/identity/identity.container.js';
import { buildPlanningContainer } from '@/modules/planning/planning.container.js';
import { buildTerritoryContainer } from '@/modules/territory/territory.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  config: ReturnType<typeof buildConfigContainer>;
  identity: ReturnType<typeof buildIdentityContainer>;
  territory: ReturnType<typeof buildTerritoryContainer>;
  approval: ReturnType<typeof buildApprovalContainer>;
  planning: ReturnType<typeof buildPlanningContainer>;
  hr: ReturnType<typeof buildHrContainer>;
  fieldMasterData: ReturnType<typeof buildFieldMasterDataContainer>;
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
  const territory = buildTerritoryContainer(identity.contract);

  // Tier 2 — Approval reads Identity (who manages the submitter, right now) and Config (which
  // kinds skip the final stage).
  const approval = buildApprovalContainer(identity.contract, config.contract);

  // Tier 3 — Planning: who the submitter and their managers are (Identity), which Routes they
  // cover (Territory), the approval workflow its Plans go through, and the deadlines (Config).
  const planning = buildPlanningContainer(identity.contract, territory.contract, approval.contract, config.contract);

  // Tier 3 — HR: employees and Pay Bands (Identity), their HQ (Territory), the LEAVE workflow
  // (Approval), the leave-year and weekly-off settings (Config).
  const hr = buildHrContainer(identity.contract, territory.contract, approval.contract, config.contract);

  // Tier 3 — Field Master Data: the Routes its Chemists sit on (Territory).
  const fieldMasterData = buildFieldMasterDataContainer(territory.contract);

  return { health, config, identity, territory, approval, planning, hr, fieldMasterData };
}
