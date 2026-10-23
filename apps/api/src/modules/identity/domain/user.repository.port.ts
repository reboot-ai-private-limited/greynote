import type { RoleName } from '@greynote/contracts';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { User, UserStatus } from './user.entity.js';

/**
 * Optional fields are widened to `| undefined` (not just `?:`) to match the shape Zod's
 * `.optional()` infers on the DTO these are built from — under `exactOptionalPropertyTypes`,
 * `field?: T` and `field?: T | undefined` are different types, and the Zod-parsed source object
 * is the latter.
 */
export interface UserListFilters {
  role?: RoleName | undefined;
  /** Resolved via `EmployeeProfile` — these two live there, not on `User`. */
  designationId?: string | undefined;
  managerId?: string | undefined;
  status?: UserStatus | undefined;
  isBlocked?: boolean | undefined;
  /** Narrow to these users (combines with the other filters). */
  ids?: string[] | undefined;
  /** Free-text match over employeeCode/name/email. */
  search?: string | undefined;
}

export interface UserListPagination {
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc';
}

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  /** Batched — one query for a whole team instead of one per member. Missing ids are skipped. */
  findByIds(ids: string[]): Promise<User[]>;
  findByEmployeeCode(employeeCode: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(
    pagination: UserListPagination,
    filters: UserListFilters,
  ): Promise<{ items: User[]; total: number }>;
  create(input: Omit<User, 'id'>): Promise<User>;
  /** `ctx` participates in a transaction (only `unblockUser` needs this) — omit for a plain single-document write. */
  update(id: string, input: Partial<Omit<User, 'id'>>, ctx?: TransactionContext): Promise<User>;
  /** Ids of the active users with this role, no paging — for a job that visits each. */
  /** Demo accounts are left out unless `includeDemo` (only a demo account's own pickers show them). */
  listActiveIdsByRole(role: 'FIELD', opts?: { includeDemo?: boolean }): Promise<string[]>;
  /** Every active user, any role, by name — the audience an Inbox message is resolved against. */
  listActive(): Promise<User[]>;
  /** Inactive accounts deactivated at or after `since`: whose access tokens may still be unexpired. */
  listDeactivatedSince(since: Date): Promise<Array<{ id: string; deactivatedAt: Date }>>;
  existsByEmployeeCode(employeeCode: string): Promise<boolean>;
  existsByEmail(email: string): Promise<boolean>;
  /** Backs the bootstrap-admin seed's idempotency check. */
  existsAdmin(): Promise<boolean>;
}
