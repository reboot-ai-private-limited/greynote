import { buildConfigContainer } from '@/modules/config/config.container.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildIdentityContainer } from '@/modules/identity/identity.container.js';
import { buildTerritoryContainer } from '@/modules/territory/territory.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  config: ReturnType<typeof buildConfigContainer>;
  identity: ReturnType<typeof buildIdentityContainer>;
  territory: ReturnType<typeof buildTerritoryContainer>;
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

  return { health, config, identity, territory };
}
