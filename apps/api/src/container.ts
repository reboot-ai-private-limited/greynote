import { buildHealthContainer } from '@/modules/health/health.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
}

export function buildContainers(): AppContainers {
  // Tier 0 — The Health module depends on no other modules!
  const health = buildHealthContainer();

  return {
    health,
  };
}
