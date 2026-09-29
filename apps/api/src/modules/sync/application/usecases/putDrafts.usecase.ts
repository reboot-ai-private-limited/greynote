import type { RoleName } from '@greynote/contracts';
import { parsePositiveInt, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { AppError } from '@/shared/errors/AppError.js';
import { DRAFT_CODES, type DraftResult, type SyncDraftInput } from '../../domain/syncDraft.entity.js';
import type { SyncDraftRepositoryPort } from '../../domain/syncDraft.repository.port.js';
import type { SyncReceiptRepositoryPort } from '../../domain/syncReceipt.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface PutDraftsResponse {
  results: DraftResult[];
  summary: { stored: number; stale: number; submitted: number; rejected: number };
}

/**
 * Backs up the day's unsent records (LLD sync.md, Draft backup; sign-off G9). The server keeps each as
 * an opaque blob and applies **no business rule** — the real handlers run only at Submit — so a draft
 * can never disagree with them or leave anything half-done.
 *
 * Upsert per user and `clientId`, **last write wins** on `clientUpdatedAt`: an older copy (a stale
 * upload, or the second phone) never overwrites a newer one, and a removal is remembered so an old
 * copy can't bring a record back. A record that already reached the server (has a receipt) has no
 * draft any more, and a late upload for it is `SUBMITTED`, not stored. Answers per draft.
 */
export class PutDraftsUseCase {
  constructor(
    private readonly drafts: SyncDraftRepositoryPort,
    private readonly receipts: SyncReceiptRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: { id: string; role: RoleName }, incoming: SyncDraftInput[]): Promise<PutDraftsResponse> {
    const user = await this.users.findUserSummary(actor.id);
    if (!user || user.role !== 'FIELD' || user.status !== 'active') {
      throw AppError.forbidden('Only active field employees can back up a daily report.');
    }
    const [maxBatch, maxBytes, maxDrafts, ttlDays, skewMinutes] = await Promise.all([
      readConfig(this.config, 'SYNC_MAX_BATCH', parsePositiveInt(10_000)),
      readConfig(this.config, 'SYNC_MAX_DRAFT_BYTES', parsePositiveInt(10_000_000)),
      readConfig(this.config, 'SYNC_MAX_DRAFTS', parsePositiveInt(1_000_000)),
      readConfig(this.config, 'SYNC_DRAFT_TTL_DAYS', parsePositiveInt(3650)),
      readConfig(this.config, 'SYNC_CLOCK_SKEW_MINUTES', parsePositiveInt(24 * 60)),
    ]);
    if (incoming.length > maxBatch) {
      throw AppError.badRequest(`At most ${maxBatch} drafts can be sent at once.`, { field: 'drafts', max: maxBatch });
    }
    const ids = incoming.map((d) => d.clientId);
    if (new Set(ids).size !== ids.length) throw AppError.badRequest('A clientId is used twice in this batch.', { field: 'drafts' });

    const now = this.now();
    const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS);
    const [submitted, held] = await Promise.all([
      this.receipts.findByClientIds(actor.id, ids).then((rows) => new Set(rows.map((r) => r.clientId))),
      this.drafts.findExistingIds(actor.id, ids),
    ]);
    let live = await this.drafts.countLive(actor.id);

    const results: DraftResult[] = [];
    for (const d of incoming) {
      const rejected = (code: string, message: string): DraftResult => ({ clientId: d.clientId, status: 'REJECTED', reason: { code, message } });
      if (submitted.has(d.clientId)) {
        results.push({ clientId: d.clientId, status: 'SUBMITTED' });
        continue;
      }
      // A clock in the future would win last-write-wins against every honest copy from then on.
      if (d.clientUpdatedAt.getTime() > now.getTime() + skewMinutes * MINUTE_MS) {
        results.push(rejected(DRAFT_CODES.clientTimeInvalid, 'This draft is dated in the future. Check the phone’s clock.'));
        continue;
      }
      if (!d.deleted) {
        const bytes = Buffer.byteLength(JSON.stringify(d.payload ?? null));
        if (bytes > maxBytes) {
          results.push(rejected(DRAFT_CODES.tooLarge, `A draft can be at most ${maxBytes} bytes; this one is ${bytes}.`));
          continue;
        }
        // Only a brand-new draft takes a slot; changing one the server already holds doesn't.
        if (!held.has(d.clientId) && live >= maxDrafts) {
          results.push(rejected(DRAFT_CODES.limitReached, `At most ${maxDrafts} unsent records can be backed up. Submit the day, or remove some.`));
          continue;
        }
      }
      const stored = await this.drafts.putIfNewer(
        { userId: actor.id, clientId: d.clientId, kind: d.deleted ? 'REMOVED' : d.kind, clientUpdatedAt: d.clientUpdatedAt, payload: d.deleted ? null : d.payload, deleted: d.deleted },
        expiresAt,
      );
      if (stored && !d.deleted && !held.has(d.clientId)) live += 1;
      results.push({ clientId: d.clientId, status: stored ? 'STORED' : 'STALE' });
    }

    const count = (s: string) => results.filter((r) => r.status === s).length;
    return { results, summary: { stored: count('STORED'), stale: count('STALE'), submitted: count('SUBMITTED'), rejected: count('REJECTED') } };
  }
}
