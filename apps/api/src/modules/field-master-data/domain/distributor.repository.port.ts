import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { CoverageScope, Distributor, DistributorDocument } from './distributor.entity.js';
import type { MasterStatus, PageQuery } from './masterStatus.js';

export interface DistributorFilter extends PageQuery {
  search?: string | undefined;
  /** Only distributors that cover any of these Zones, HQs or Routes (already resolved from a place); all empty matches nothing. */
  scope?: CoverageScope | undefined;
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
  /** Active Distributors this user is assigned to, or whose coverage meets the places they work in — the phone's cache. */
  listActiveForUser(userId: string, scope: CoverageScope): Promise<Distributor[]>;
  addDocument(id: string, document: DistributorDocument): Promise<Distributor | null>;
  /** Takes the document off; returns the removed one (so its file can be deleted), or `null` if it was not there. */
  removeDocument(id: string, documentId: string): Promise<DistributorDocument | null>;
  create(input: Omit<Distributor, 'id'>): Promise<Distributor>;
  update(id: string, change: Partial<Omit<Distributor, 'id'>>): Promise<Distributor | null>;
  /** How many distributors list this employee among their assigned people. */
  countAssignee(userId: string): Promise<number>;
  /** Takes this employee off every distributor's assigned people; returns how many distributors changed. */
  removeAssignee(userId: string): Promise<number>;
}
