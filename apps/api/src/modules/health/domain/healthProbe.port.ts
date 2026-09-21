import type { DependencyHealth } from "@/modules/health/domain/health.entity";

export interface HealthProbePort{
    readonly name: string,
    check(): Promise<DependencyHealth>;
}