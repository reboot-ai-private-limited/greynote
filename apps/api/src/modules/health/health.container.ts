import type { Router } from 'express';
import { GetHealthUseCase } from '@/modules/health/application/usecases/getHealth.usecases';
import type { HealthProbePort } from '@/modules/health/domain/healthProbe.port';
import { MemoryHealthProbe } from '@/modules/health/infrastructure/memoryHealthProbe.adapter';
import { makeGetHealthController } from '@/modules/health/interface/health.controller';
import { buildHealthRouter } from '@/modules/health/interface/health.route';
import type { HealthPublicContract } from '@/modules/health/health.public';

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
