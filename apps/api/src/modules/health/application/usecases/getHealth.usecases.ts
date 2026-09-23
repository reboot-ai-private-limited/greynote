import { summarise, type HealthReport } from '../../domain/health.entity.js';
import type { HealthProbePort } from '../../domain/healthProbe.port.js';

export class GetHealthUseCase {
  constructor(
    private readonly probes: HealthProbePort[],
    private readonly uptime: () => number = () => process.uptime(),
  ) {}

  async execute(): Promise<HealthReport> {
    const results = await Promise.allSettled(this.probes.map((p) => p.check()));

    const deps = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            name: this.probes[i]?.name ?? 'unknown',
            status: 'down' as const,
            detail: 'probe threw',
          },
    );

    return summarise(deps, this.uptime());
  }
}
