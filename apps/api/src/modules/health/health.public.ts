import type { HealthReport } from '@/modules/health/domain/health.entity';

export interface HealthPublicContract {
    report(): Promise<HealthReport>;
}
