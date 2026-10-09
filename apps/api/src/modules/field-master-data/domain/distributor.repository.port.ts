import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from './distributor.entity.js';
import type { MasterStatus, PageQuery } from './masterStatus.js';

export interface DistributorFilter extends PageQuery {
  search?: string | undefined;
  /** Restrict to these Routes (already resolved from a Zone or HQ); `[]` matches nothing. */
  routeIds?: string[] | undefined;
  assignedUserId?: string | undefined;
  status?: MasterStatus | undefined;
}

export interface DistributorRepositoryPort {
  list(filter: DistributorFilter): Promise<PaginatedResult<Distributor>>;
  findById(id: string): Promise<Distributor | null>;
  /** Batched; an id that is not there is skipped. */
  findByIds(ids: string[]): Promise<Distributor[]>;
  /** Every active one, by name — a report's list of who should have reported. */
  listAllActive(): Promise<Distributor[]>;
  /** Active Distributors this user is assigned to, or that sit on one of these Routes — the phone's cache. */
  listActiveForUser(userId: string, routeIds: string[]): Promise<Distributor[]>;
  create(input: Omit<Distributor, 'id'>): Promise<Distributor>;
  update(id: string, change: Partial<Omit<Distributor, 'id'>>): Promise<Distributor | null>;
}
