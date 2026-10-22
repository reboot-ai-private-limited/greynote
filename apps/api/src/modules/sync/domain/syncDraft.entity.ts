/**
 * The MR's unsent copy of one record (LLD sync.md, Draft backup): an opaque blob the phone backs up
 * whenever it has a connection, so a lost phone doesn't lose the day. Nothing reads it but the owner,
 * no business rule runs on it, and it counts for nothing until Submit sends the record itself.
 *
 * A removal is kept as a tombstone (`deleted`), so an older copy arriving late can't bring the
 * record back. Last write wins on `clientUpdatedAt`.
 */
export interface SyncDraft {
  userId: string;
  clientId: string;
  kind: string;
  /** When the MR last changed it on the phone — the last-write-wins clock. */
  clientUpdatedAt: Date;
  /** `null` for a tombstone. */
  payload: unknown;
  deleted: boolean;
}

/** What the phone sends for one draft. */
export type SyncDraftInput = { clientId: string; clientUpdatedAt: Date } & (
  | { deleted: false; kind: string; payload: unknown }
  | { deleted: true }
);

export const DRAFT_STATUSES = ['STORED', 'STALE', 'SUBMITTED', 'REJECTED'] as const;
/**
 * `STORED` — kept (or its removal noted). `STALE` — a copy at least as new is already held, so this one
 * changed nothing. `SUBMITTED` — that record already reached the server, so its draft is moot.
 * `REJECTED` — refused, with a `reason`.
 */
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export interface DraftResult {
  clientId: string;
  status: DraftStatus;
  reason?: { code: string; message: string; details?: Record<string, string> };
}

export const DRAFT_CODES = {
  tooLarge: 'DRAFT_TOO_LARGE',
  limitReached: 'DRAFT_LIMIT_REACHED',
  clientTimeInvalid: 'CLIENT_TIME_INVALID',
} as const;
