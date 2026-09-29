/** One record the app sends at the daily report's Submit (LLD sync.md, Push). */
export interface SyncRecordInput {
  /** The app's own id for it — a UUID made when the record was created. Makes a retry safe. */
  clientId: string;
  /** Which handler applies it, e.g. `NEW_DOCTOR`. Owning modules register the kinds. */
  kind: string;
  /** Client ids of the records that must be applied first; a record whose parent failed fails too. */
  dependsOn: string[];
  /** When the MR made it on the phone. Cutoffs are judged on this, not on when it arrived. */
  clientCreatedAt: Date;
  /** Opaque here; the kind's handler validates it. */
  payload: unknown;
}

export const SYNC_STATUSES = ['SYNCED', 'ALREADY_SYNCED', 'FAILED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Why a record failed — a code the app can act on and a message for the MR. */
export interface SyncReason {
  code: string;
  message: string;
}

/** The outcome for one record. There is one per record sent, never one verdict for the batch. */
export interface SyncResult {
  clientId: string;
  status: SyncStatus;
  /** The id of what was created or updated on the server. */
  serverId?: string;
  reason?: SyncReason;
}

/** The codes the engine itself uses; a handler's own refusals bring their own. */
export const SYNC_CODES = {
  dependencyFailed: 'DEPENDENCY_FAILED',
  invalidDependency: 'INVALID_DEPENDENCY',
  unknownKind: 'UNKNOWN_KIND',
  clientTimeInvalid: 'CLIENT_TIME_INVALID',
  internal: 'INTERNAL',
} as const;
