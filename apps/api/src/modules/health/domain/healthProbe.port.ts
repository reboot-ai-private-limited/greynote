import type { DependencyHealth } from './health.entity.js';

export interface HealthProbePort {
  readonly name: string;
  check(): Promise<DependencyHealth>;
}
