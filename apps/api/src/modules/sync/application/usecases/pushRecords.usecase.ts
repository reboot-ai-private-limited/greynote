import type { RoleName } from '@greynote/contracts';
import { parsePositiveInt, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { SyncRejection } from '../../domain/syncHandler.js';
import { SYNC_CODES, type SyncReason, type SyncRecordInput, type SyncResult } from '../../domain/syncRecord.js';
import type { SyncDraftRepositoryPort } from '../../domain/syncDraft.repository.port.js';
import type { SyncReceiptRepositoryPort } from '../../domain/syncReceipt.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { orderRecords } from '../orderRecords.js';
import type { SyncHandlerRegistry } from '../syncHandlerRegistry.js';

export interface PushResponse {
  results: SyncResult[];
  summary: { synced: number; alreadySynced: number; failed: number };
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * The daily report's Submit (LLD sync.md, Push): applies each record through its kind's handler,
 * once, in dependency order, and answers **per record** — one refusal never sinks the rest of the
 * day. Idempotent on `(user, clientId)`: a record already applied comes back `ALREADY_SYNCED` with its
 * original `serverId` and its handler doesn't run again, so the MR can tap Submit as often as a bad
 * connection needs.
 *
 * Each record is its own transaction (handler writes + receipt), so a failure leaves no half-written
 * record and can't undo its neighbours. Only applied records get a receipt; a failed one is applied
 * fresh when it's fixed and sent again.
 */
export class PushRecordsUseCase {
  constructor(
    private readonly handlers: SyncHandlerRegistry,
    private readonly receipts: SyncReceiptRepositoryPort,
    private readonly drafts: SyncDraftRepositoryPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: { id: string; role: RoleName }, records: SyncRecordInput[]): Promise<PushResponse> {
    await this.assertMayPush(actor);
    const maxBatch = await readConfig(this.config, 'SYNC_MAX_BATCH', parsePositiveInt(10_000));
    if (records.length > maxBatch) {
      throw AppError.badRequest(`At most ${maxBatch} records can be sent at once.`, { field: 'records', max: maxBatch });
    }
    const ids = records.map((r) => r.clientId);
    if (new Set(ids).size !== ids.length) throw AppError.badRequest('A clientId is used twice in this batch.', { field: 'records' });

    const inBatch = new Set(ids);
    const outside = [...new Set(records.flatMap((r) => r.dependsOn).filter((d) => !inBatch.has(d)))];
    const receiptByClientId = new Map(
      (await this.receipts.findByClientIds(actor.id, [...ids, ...outside])).map((r) => [r.clientId, r]),
    );

    const results = new Map<string, SyncResult>();
    const failed = new Set<string>();
    const fail = (clientId: string, reason: SyncReason) => {
      results.set(clientId, { clientId, status: 'FAILED', reason });
      failed.add(clientId);
    };

    // Already delivered: answered from the receipt, handler untouched.
    const fresh: SyncRecordInput[] = [];
    for (const r of records) {
      const receipt = receiptByClientId.get(r.clientId);
      if (receipt) results.set(r.clientId, { clientId: r.clientId, status: 'ALREADY_SYNCED', serverId: receipt.serverId, ...(receipt.data !== undefined && { data: receipt.data }) });
      else fresh.push(r);
    }

    const known = new Set(receiptByClientId.keys());
    const { order, invalid } = orderRecords(fresh, known);
    for (const [clientId, message] of invalid) fail(clientId, { code: SYNC_CODES.invalidDependency, message });

    const now = this.now();
    const [skewMinutes, maxAgeDays] = await Promise.all([
      readConfig(this.config, 'SYNC_CLOCK_SKEW_MINUTES', parsePositiveInt(24 * 60)),
      readConfig(this.config, 'SYNC_MAX_AGE_DAYS', parsePositiveInt(365)),
    ]);

    for (const record of order) {
      const brokenParent = record.dependsOn.find((d) => failed.has(d));
      if (brokenParent) {
        fail(record.clientId, { code: SYNC_CODES.dependencyFailed, message: 'A record this one depends on could not be synced, so this one was not applied.' });
        continue;
      }
      const handler = this.handlers.find(record.kind);
      if (!handler) {
        fail(record.clientId, { code: SYNC_CODES.unknownKind, message: `The server doesn't know the record kind "${record.kind}". Update the app.` });
        continue;
      }
      const clientTime = record.clientCreatedAt.getTime();
      if (clientTime > now.getTime() + skewMinutes * MINUTE_MS) {
        fail(record.clientId, { code: SYNC_CODES.clientTimeInvalid, message: 'This record is dated in the future. Check the phone’s clock.' });
        continue;
      }
      if (clientTime < now.getTime() - maxAgeDays * DAY_MS) {
        fail(record.clientId, { code: SYNC_CODES.clientTimeInvalid, message: `This record is more than ${maxAgeDays} days old and can no longer be sent.` });
        continue;
      }

      const outcome = await this.apply(actor.id, record, handler.apply.bind(handler), now);
      results.set(record.clientId, outcome);
      if (outcome.status === 'FAILED') failed.add(record.clientId);
    }

    const ordered = records.map((r) => results.get(r.clientId)!);
    return {
      results: ordered,
      summary: {
        synced: ordered.filter((r) => r.status === 'SYNCED').length,
        alreadySynced: ordered.filter((r) => r.status === 'ALREADY_SYNCED').length,
        failed: ordered.filter((r) => r.status === 'FAILED').length,
      },
    };
  }

  private async apply(
    userId: string,
    record: SyncRecordInput,
    apply: (input: { userId: string; clientId: string; clientCreatedAt: Date; payload: unknown }, ctx: unknown) => Promise<{ serverId: string; data?: unknown }>,
    now: Date,
  ): Promise<SyncResult> {
    try {
      const { serverId, data } = await this.transactions.run(async (ctx) => {
        const created = await apply({ userId, clientId: record.clientId, clientCreatedAt: record.clientCreatedAt, payload: record.payload }, ctx);
        await this.receipts.create({ userId, clientId: record.clientId, kind: record.kind, serverId: created.serverId, ...(created.data !== undefined && { data: created.data }), syncedAt: now }, ctx);
        // The record is committed, so its private backup is moot — cleared in the same transaction, so a record
        // that didn't commit keeps its draft and one that did can't leave one behind.
        await this.drafts.deleteForRecord(userId, record.clientId, ctx);
        return created;
      });
      return { clientId: record.clientId, status: 'SYNCED', serverId, ...(data !== undefined && { data }) };
    } catch (err) {
      // Whatever went wrong, a simultaneous send of this same record may have delivered it meanwhile — its
      // transaction won and this one rolled back whole. The record is on the server then, so say so, rather
      // than report a failure the MR would only have to retry. (Looked up only on the failure path.)
      const [receipt] = await this.receipts.findByClientIds(userId, [record.clientId]);
      if (receipt) return { clientId: record.clientId, status: 'ALREADY_SYNCED', serverId: receipt.serverId, ...(receipt.data !== undefined && { data: receipt.data }) };
      if (err instanceof SyncRejection) return { clientId: record.clientId, status: 'FAILED', reason: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } };
      if (err instanceof AppError && err.statusCode < 500) {
        return { clientId: record.clientId, status: 'FAILED', reason: { code: err.code, message: err.message } };
      }
      // A fault: logged in full here, reported to the phone as a retryable INTERNAL with nothing of its detail.
      logger.error({ err: String(err), kind: record.kind, clientId: record.clientId }, 'sync record failed');
      return {
        clientId: record.clientId,
        status: 'FAILED',
        reason: { code: SYNC_CODES.internal, message: 'Something went wrong on the server. Try Submit again.' },
      };
    }
  }

  private async assertMayPush(actor: { id: string; role: RoleName }): Promise<void> {
    const user = await this.users.findUserSummary(actor.id);
    if (!user || user.role !== 'FIELD' || user.status !== 'active') {
      throw AppError.forbidden('Only active field employees can send a daily report.');
    }
  }
}
