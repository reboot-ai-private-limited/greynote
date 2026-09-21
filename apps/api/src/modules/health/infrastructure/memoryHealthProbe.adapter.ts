import type { HealthProbePort } from '@/modules/health/domain/healthProbe.port';
import type { DependencyHealth } from '@/modules/health/domain/health.entity';

export class MemoryHealthProbe implements HealthProbePort {
    readonly name = 'MemoryStore';

    async check(): Promise<DependencyHealth> {
        return { name: this.name, status: 'up' };
    }
}