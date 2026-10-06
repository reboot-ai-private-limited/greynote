import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { MasterStatus, PageQuery } from './masterStatus.js';
import type { Specialty } from './specialty.entity.js';

export interface SpecialtyFilter extends PageQuery {
  search?: string | undefined;
  status?: MasterStatus | undefined;
}

export interface SpecialtyRepositoryPort {
  list(filter: SpecialtyFilter): Promise<PaginatedResult<Specialty>>;
  findById(id: string): Promise<Specialty | null>;
  /** Ignoring case and surrounding spaces; any status. */
  findByName(name: string): Promise<Specialty | null>;
  /** Every active speciality, A–Z — the dropdown, and the phone's cache. */
  listActive(): Promise<Specialty[]>;
  /** `null` if the name is taken. */
  create(input: { name: string }): Promise<Specialty | null>;
  /** `null` if the row is missing or the new name is taken. */
  update(id: string, change: { name?: string; status?: MasterStatus }): Promise<Specialty | null>;
  /** Adds the names that are missing (ignoring case); returns how many were added. For the seed. */
  addMissing(names: string[]): Promise<number>;
}
