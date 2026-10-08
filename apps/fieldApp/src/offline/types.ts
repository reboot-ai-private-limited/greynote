/**
 * `DRAFT` — being worked on, not in the day's report yet. `QUEUED` — in the day's report, waiting
 * for Submit. `SYNCED` — the server has it. `FAILED` — the server refused it; the MR fixes it and
 * sends it again. See hld/01 §1.2 and LLD/sync.md.
 */
export type OutboxStatus = 'DRAFT' | 'QUEUED' | 'SYNCED' | 'FAILED';

/** Record kinds the server's sync handlers accept (LLD/sync.md, "The kinds registered so far"). */
export type SyncKind =
  | 'NEW_DOCTOR'
  | 'DCR_SUBMIT'
  | 'DOCTOR_CALL'
  | 'CHEMIST_CALL'
  | 'DOCTOR_FOLLOWUP'
  | 'CHEMIST_FOLLOWUP'
  | 'EXPENSE'
  | 'DOCTOR_SERVICE'
  | 'GIFT_DONE'
  | 'MONTHLY_STOCK'
  | 'ORDER';

export type OutboxRecord = {
  /** Client-generated UUID, made once at creation. It is also the server's idempotency key. */
  clientId: string;
  kind: SyncKind;
  payload: unknown;
  /** Client ids that must reach the server first (the DCR submit depends on the whole day). */
  dependsOn: string[];
  status: OutboxStatus;
  /** ISO. When the MR made it — the server judges cutoffs on this, not on arrival time. */
  clientCreatedAt: string;
  /** ISO. Last-write-wins clock for the draft backup. */
  clientUpdatedAt: string;
  serverId: string | null;
  /** The server's version of the record (e.g. the recomputed geofence), replacing the local one. */
  serverData: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  /** The MR removed it; kept until the backup has told the server, then purged. */
  deleted: boolean;
  /** Changed since the last successful draft backup. */
  dirty: boolean;
};

export type CachedSource = {
  version: string;
  data: unknown;
  /** ISO — when this snapshot was last confirmed current. */
  fetchedAt: string;
};

/** Everything the offline layer persists. SQLite on phones, in memory on web (see store.ts). */
export interface Store {
  upsertRecord(record: OutboxRecord): Promise<void>;
  getRecord(clientId: string): Promise<OutboxRecord | null>;
  /** Live records (not removed), oldest first. */
  listRecords(filter?: { status?: OutboxStatus | OutboxStatus[]; kind?: SyncKind }): Promise<OutboxRecord[]>;
  /** Removed records the backup hasn't told the server about yet. */
  listTombstones(): Promise<OutboxRecord[]>;
  purgeRecords(clientIds: string[]): Promise<void>;
  getCache(source: string): Promise<CachedSource | null>;
  setCache(source: string, entry: CachedSource): Promise<void>;
  listCacheVersions(): Promise<Record<string, string>>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  /** Everything — on logout, so the next person on this phone sees nothing of the last one's. */
  clearAll(): Promise<void>;
}
