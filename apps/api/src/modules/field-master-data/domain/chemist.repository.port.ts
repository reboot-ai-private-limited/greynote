import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from './chemist.entity.js';
import type { MasterStatus, PageQuery } from './masterStatus.js';

export interface ChemistFilter extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  status?: MasterStatus | undefined;
}

export interface ChemistRepositoryPort {
  list(filter: ChemistFilter): Promise<PaginatedResult<Chemist>>;
  findById(id: string): Promise<Chemist | null>;
  /** Batched; an id that is not there is skipped. */
  findByIds(ids: string[]): Promise<Chemist[]>;
  /** Every active Chemist on these Routes — the phone's cache. */
  listActiveOnRoutes(routeIds: string[]): Promise<Chemist[]>;
  create(input: Omit<Chemist, 'id'>): Promise<Chemist>;
  update(id: string, change: Partial<Omit<Chemist, 'id'>>): Promise<Chemist | null>;
}
