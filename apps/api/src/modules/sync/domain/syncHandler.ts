import type { TransactionContext } from '@/shared/db/transaction.port.js';

/** What a handler is given for one record. */
export interface SyncApplyContext {
  userId: string;
  clientId: string;
  clientCreatedAt: Date;
  payload: unknown;
}

/**
 * What an owning module declares about one kind of record when it registers it (the way it
 * registers an approval kind). Registered once at boot; the sync module knows no kind until then.
 */
export interface SyncHandlerDefinition {
  kind: string;
  /**
   * Creates the record. Runs inside a transaction that also writes the receipt — write through `ctx`,
   * so both commit or neither does. Validate `payload` here (it arrives as `unknown`).
   *
   * Refuse a record by throwing `SyncRejection` (or an `AppError` with a 4xx status): a stale
   * assignment, an exhausted allocation, a closed cutoff. That becomes the record's `reason` and the
   * rest of the batch carries on. Any other error is a fault: the record is reported `INTERNAL`,
   * retryable, and its detail is never sent to the phone.
   *
   * `data` is the server's own version of what it made — the values it computed or overwrote (a call's
   * geofence status, say) — sent back to the phone in the result (sign-off G10) and kept with the receipt,
   * so a retry gets the same answer. Small, plain JSON.
   *
   * May run again on a transient-error retry, so keep it to database writes on `ctx`.
   */
  apply(input: SyncApplyContext, ctx: TransactionContext): Promise<{ serverId: string; data?: unknown }>;
}

/** A handler's domain refusal of one record. */
export class SyncRejection extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncRejection';
  }
}
