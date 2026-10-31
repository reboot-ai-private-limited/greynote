import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Chemist, ChemistStatus } from './chemist.entity.js';
import type { PageQuery } from './masterStatus.js';

export interface ChemistFilter extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  status?: ChemistStatus | undefined;
}

export interface ChemistRepositoryPort {
  list(filter: ChemistFilter): Promise<PaginatedResult<Chemist>>;
  findById(id: string): Promise<Chemist | null>;
  /** Batched; an id that is not there is skipped. */
  findByIds(ids: string[]): Promise<Chemist[]>;
  /** Every active one, by name — a report's list of who should have reported. */
  listAllActive(): Promise<Chemist[]>;
  /** Every active Chemist on these Routes — the phone's cache. */
  listActiveOnRoutes(routeIds: string[]): Promise<Chemist[]>;
  create(input: Omit<Chemist, 'id'>): Promise<Chemist>;
  /** An employee-added Chemist. Throws `DuplicateRecordError` if this employee already created one with the same `clientRequestId`. */
  createProposed(input: Omit<Chemist, 'id'>, ctx: TransactionContext): Promise<Chemist>;
  findByClientRequest(addedBy: string, clientRequestId: string): Promise<Chemist | null>;
  /** Chemists this user added, in any status, newest first. */
  listAdded(addedBy: string, page: PageQuery): Promise<PaginatedResult<Chemist>>;
  update(id: string, change: Partial<Omit<Chemist, 'id'>>, ctx?: TransactionContext): Promise<Chemist | null>;
}

export type { TransactionContext };
