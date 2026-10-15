import type { ManagerCoverage } from './managerCoverage.entity.js';

export interface ManagerCoverageRepositoryPort {
  find(userId: string): Promise<ManagerCoverage | null>;
  findMany(userIds: string[]): Promise<ManagerCoverage[]>;
  /** Replaces the manager's coverage whole. */
  save(input: { userId: string; hqIds: string[]; zoneIds: string[]; updatedBy: string }): Promise<ManagerCoverage>;
}
