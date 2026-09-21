import { summarise, type HealthReport } from '@/modules/health/domain/health.entity';
    import type { HealthProbePort } from '@/modules/health/domain/healthProbe.port';
    
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
