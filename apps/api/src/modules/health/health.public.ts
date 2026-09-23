import type { HealthReport } from './domain/health.entity.js';

export interface HealthPublicContract {
  report(): Promise<HealthReport>;
}
