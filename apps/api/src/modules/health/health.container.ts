import type { Router } from 'express';
import { GetHealthUseCase } from './application/usecases/getHealth.usecases.js';
import type { HealthProbePort } from './domain/healthProbe.port.js';
import { MemoryHealthProbe } from './infrastructure/memoryHealthProbe.adapter.js';
import { makeGetHealthController } from './interface/health.controller.js';
import { buildHealthRouter } from './interface/health.route.js';
import type { HealthPublicContract } from './health.public.js';

export interface HealthContainer {
  contract: HealthPublicContract;
  buildRouter: () => Router;
}

export function buildHealthContainer(): HealthContainer {
  // 1. Create the concrete adapters
  const probes: HealthProbePort[] = [new MemoryHealthProbe()];

  // 2. Inject adapters into the Use Case
  const getHealth = new GetHealthUseCase(probes);

  return {
    // Expose the public contract for other internal modules
    contract: {
      report: () => getHealth.execute(),
    },
    // Expose the HTTP Router for Express
    buildRouter: () => buildHealthRouter(makeGetHealthController(getHealth)),
  };
}
