import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Chemist, ChemistStatus } from './chemist.entity.js';
import type { PageQuery } from './masterStatus.js';

export interface ChemistFilter extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  status?: ChemistStatus | undefined;
  /** Only Chemists on any of these Routes; an empty list matches nothing. */
  routeIds?: string[] | undefined;
  placeId?: string | undefined;
  /** Only Chemists on any of these places (an employee's HQ, an HQ / Zone filter); an empty list matches nothing. */
  placeIds?: string[] | undefined;
  /** Not these Chemists (the ones an employee already holds, for the assign picker). */
  excludeIds?: string[] | undefined;
  /** Also these Chemists whatever their name (the ones an employee matched by the search term holds). */
  alsoIds?: string[] | undefined;
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
  /** Active Chemists among these ids, by name, optionally narrowed by Route and by a name search (which also keeps `alsoIds`, e.g. Chemists of an MR whose name matched) and paged — a team read over assignments. */
  listActiveAmong(ids: string[], filter: { search?: string | undefined; routeId?: string | undefined; alsoIds?: string[] | undefined }, page: PageQuery): Promise<PaginatedResult<Chemist>>;
  create(input: Omit<Chemist, 'id'>): Promise<Chemist>;
  /** An employee-added Chemist. Throws `DuplicateRecordError` if this employee already created one with the same `clientRequestId`. */
  createProposed(input: Omit<Chemist, 'id'>, ctx: TransactionContext): Promise<Chemist>;
  findByClientRequest(addedBy: string, clientRequestId: string): Promise<Chemist | null>;
  /** A pending or active Chemist with this phone number (any spelling of it), leaving out `excludeId`; `null` when the number is free. */
  findByPhone(phone: string, excludeId?: string): Promise<Chemist | null>;
  /** Deletes a chemist that was never approved (not `active`), in the caller's transaction. False if there was none to delete. */
  deleteProposed(id: string, ctx: TransactionContext): Promise<boolean>;
  /** Chemists this user added, in any status, newest first. */
  listAdded(addedBy: string, page: PageQuery): Promise<PaginatedResult<Chemist>>;
  update(id: string, change: Partial<Omit<Chemist, 'id'>>, ctx?: TransactionContext): Promise<Chemist | null>;
}

export type { TransactionContext };
