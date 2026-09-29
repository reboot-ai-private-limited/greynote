import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from './distributor.entity.js';
import type { MasterStatus, PageQuery } from './masterStatus.js';

export interface DistributorFilter extends PageQuery {
  search?: string | undefined;
  /** Restrict to these Routes (already resolved from a Zone, HQ or Area); `[]` matches nothing. */
  routeIds?: string[] | undefined;
  assignedMrId?: string | undefined;
  status?: MasterStatus | undefined;
}

export interface DistributorRepositoryPort {
  list(filter: DistributorFilter): Promise<PaginatedResult<Distributor>>;
  findById(id: string): Promise<Distributor | null>;
  create(input: Omit<Distributor, 'id'>): Promise<Distributor>;
  update(id: string, change: Partial<Omit<Distributor, 'id'>>): Promise<Distributor | null>;
}
