import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Doctor, DoctorStatus } from './doctor.entity.js';
import type { PageQuery } from './masterStatus.js';

export interface DoctorFilter extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  status?: DoctorStatus | undefined;
}

/**
 * Whose Doctors to read. `routeIds` is the set of Routes that user currently has when visibility
 * follows the Route (`DOCTOR_VISIBILITY_FOLLOWS_ROUTE`); `null` means every assigned Doctor counts.
 */
export interface AssignedScope {
  userId: string;
  routeIds: string[] | null;
}

export type AssignedDoctor = Doctor & { assignedUserId: string };

export interface DoctorRepositoryPort {
  list(filter: DoctorFilter): Promise<PaginatedResult<Doctor>>;
  findById(id: string): Promise<Doctor | null>;
  create(input: Omit<Doctor, 'id'>): Promise<Doctor>;
  /** An MR-added Doctor. Throws `DuplicateRecordError` if this MR already created one with the same `clientRequestId`. */
  createProposed(input: Omit<Doctor, 'id'>, ctx: TransactionContext): Promise<Doctor>;
  findByClientRequest(addedBy: string, clientRequestId: string): Promise<Doctor | null>;
  update(id: string, change: Partial<Omit<Doctor, 'id'>>, ctx?: TransactionContext): Promise<Doctor | null>;
  /** Renames a speciality on every Doctor that carries it (the name compared ignoring case); returns how many. */
  renameSpecialty(from: string, to: string): Promise<number>;
  /** The Doctors this user added that are still waiting for approval. */
  listPendingAdded(addedBy: string): Promise<Doctor[]>;
  /** Doctors this user added, in any status, newest first. */
  listAdded(addedBy: string, page: PageQuery): Promise<PaginatedResult<Doctor>>;
  /**
   * The active Doctors with an active assignment to one of these users (and, per scope, on a Route
   * that user has). `page: null` returns them all.
   */
  listAssigned(
    scopes: AssignedScope[],
    filter: Omit<DoctorFilter, 'status' | keyof PageQuery>,
    page: PageQuery | null,
  ): Promise<{ items: AssignedDoctor[]; total: number }>;
}

export type { TransactionContext };
