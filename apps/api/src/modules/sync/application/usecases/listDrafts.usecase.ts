import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { SyncDraftRepositoryPort } from '../../domain/syncDraft.repository.port.js';
import type { SyncReceiptRepositoryPort } from '../../domain/syncReceipt.repository.port.js';

export interface DraftView {
  clientId: string;
  kind: string;
  /** ISO 8601 — the wire format (`@greynote/contracts`). */
  clientUpdatedAt: string;
  payload: unknown;
}

export interface DraftsPage {
  drafts: DraftView[];
  /** Pass as `after` for the next page; `null` when this was the last. */
  nextCursor: string | null;
}

/**
 * Restores the caller's own unsent records — e.g. on a new phone after the old one was lost. Only the
 * owner can read them (the user comes from the token; there is no other way to name one). Removed
 * drafts aren't returned, nor are those whose record has since reached the server: a stale upload
 * that raced a Submit must not come back as if it were still unsent. Paged, since a day can hold up to
 * `SYNC_MAX_DRAFTS` blobs.
 */
export class ListDraftsUseCase {
  constructor(
    private readonly drafts: SyncDraftRepositoryPort,
    private readonly receipts: SyncReceiptRepositoryPort,
  ) {}

  async execute(actor: { id: string; role: RoleName }, page: { after: string | null; limit: number }): Promise<DraftsPage> {
    if (actor.role !== 'FIELD') throw AppError.forbidden('Only field employees have a daily report.');
    const rows = await this.drafts.listLive(actor.id, page.after, page.limit);
    const hasMore = rows.length > page.limit;
    const pageRows = rows.slice(0, page.limit);
    const submitted = new Set((await this.receipts.findByClientIds(actor.id, pageRows.map((r) => r.clientId))).map((r) => r.clientId));
    return {
      drafts: pageRows.filter((r) => !submitted.has(r.clientId)).map((r) => ({ clientId: r.clientId, kind: r.kind, clientUpdatedAt: r.clientUpdatedAt.toISOString(), payload: r.payload })),
      nextCursor: hasMore ? pageRows[pageRows.length - 1]!.id : null,
    };
  }
}
