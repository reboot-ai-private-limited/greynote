import type { EmployeeDraft, EmployeeDraftData } from './employeeDraft.entity.js';

export interface EmployeeDraftRepositoryPort {
  create(input: { createdBy: string; step: number; data: EmployeeDraftData }): Promise<EmployeeDraft>;
  findById(id: string): Promise<EmployeeDraft | null>;
  /** Newest edit first. */
  list(): Promise<EmployeeDraft[]>;
  update(id: string, patch: { step?: number; data?: EmployeeDraftData; createdUserId?: string }): Promise<EmployeeDraft | null>;
  delete(id: string): Promise<void>;
}
