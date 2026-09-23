import type { HealthProbePort } from '../domain/healthProbe.port.js';
import type { DependencyHealth } from '../domain/health.entity.js';

export class MemoryHealthProbe implements HealthProbePort {
  readonly name = 'MemoryStore';

  async check(): Promise<DependencyHealth> {
    return { name: this.name, status: 'up' };
  }
}
