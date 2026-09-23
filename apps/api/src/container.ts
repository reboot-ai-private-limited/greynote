import { buildConfigContainer } from '@/modules/config/config.container.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildIdentityContainer } from '@/modules/identity/identity.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  config: ReturnType<typeof buildConfigContainer>;
  identity: ReturnType<typeof buildIdentityContainer>;
}

export async function buildContainers(): Promise<AppContainers> {
  // Tier 0 — Health and Config depend on no other modules.
  const health = buildHealthContainer();
  const config = buildConfigContainer();
  await config.seed();

  // Tier 1 — Identity depends only on Config's public contract, per MODULE_TIERS.
  const identity = buildIdentityContainer(config.contract);
  await identity.seedBootstrapAdmin();

  return { health, config, identity };
}
