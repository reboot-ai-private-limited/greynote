import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { SyncApplyContext, SyncHandlerDefinition } from '../../domain/syncHandler.js';
import type { SyncDraft } from '../../domain/syncDraft.entity.js';
import type { SyncDraftRepositoryPort } from '../../domain/syncDraft.repository.port.js';
import type { SyncReceipt } from '../../domain/syncReceipt.entity.js';
import { DuplicateReceiptError, type SyncReceiptRepositoryPort } from '../../domain/syncReceipt.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { SyncHandlerRegistry } from '../syncHandlerRegistry.js';
import { ListDraftsUseCase } from './listDrafts.usecase.js';
import { PushRecordsUseCase } from './pushRecords.usecase.js';
import { PutDraftsUseCase } from './putDrafts.usecase.js';

/** In-memory fakes for the sync module's tests — no Mongo, no other module's internals. */

/** A transaction with an undo log, so a test can prove "all or nothing" without a database. */
export class FakeTx {
  undo: Array<() => void> = [];
}

export class FakeTransactions implements TransactionRunnerPort {
  async run<T>(fn: (ctx: unknown) => Promise<T>): Promise<T> {
    const tx = new FakeTx();
    try {
      return await fn(tx);
    } catch (err) {
      for (const undo of tx.undo.reverse()) undo();
      throw err;
    }
  }
}

export class FakeReceipts implements SyncReceiptRepositoryPort {
  rows: SyncReceipt[] = [];
  /** Runs while `findByClientIds` is answering — to interleave a competing push. */
  onFind: (() => Promise<void>) | undefined;
  async findByClientIds(userId: string, clientIds: string[]) {
    await this.onFind?.();
    return this.rows.filter((r) => r.userId === userId && clientIds.includes(r.clientId));
  }
  /** Check and insert in one synchronous step, like the unique index. */
  async create(receipt: SyncReceipt, ctx: unknown) {
    if (this.rows.some((r) => r.userId === receipt.userId && r.clientId === receipt.clientId)) throw new DuplicateReceiptError();
    this.rows.push(receipt);
    (ctx as FakeTx).undo.push(() => {
      this.rows = this.rows.filter((r) => r !== receipt);
    });
  }
}

export class FakeDrafts implements SyncDraftRepositoryPort {
  rows: Array<SyncDraft & { id: string; expiresAt: Date }> = [];
  private next = 1;
  /** Compare-and-set in one synchronous step, like the conditional upsert + unique index. */
  async putIfNewer(draft: SyncDraft, expiresAt: Date) {
    const held = this.rows.find((r) => r.userId === draft.userId && r.clientId === draft.clientId);
    if (held && held.clientUpdatedAt.getTime() >= draft.clientUpdatedAt.getTime()) return false;
    if (held) Object.assign(held, { ...draft, expiresAt });
    else this.rows.push({ ...draft, expiresAt, id: String(this.next++).padStart(24, '0') });
    return true;
  }
  async findExistingIds(userId: string, clientIds: string[]) {
    return new Set(this.rows.filter((r) => r.userId === userId && clientIds.includes(r.clientId)).map((r) => r.clientId));
  }
  async countLive(userId: string) {
    return this.rows.filter((r) => r.userId === userId && !r.deleted).length;
  }
  async listLive(userId: string, afterId: string | null, limit: number) {
    return this.rows.filter((r) => r.userId === userId && !r.deleted && (afterId === null || r.id > afterId)).slice(0, limit + 1);
  }
  async deleteForRecord(userId: string, clientId: string, ctx: unknown) {
    const row = this.rows.find((r) => r.userId === userId && r.clientId === clientId);
    if (!row) return;
    this.rows = this.rows.filter((r) => r !== row);
    (ctx as FakeTx).undo.push(() => {
      this.rows.push(row);
    });
  }
}

export class FakeUsers implements UserDirectoryPort {
  users = new Map<string, { id: string; role: 'FIELD' | 'ADMIN' | 'HR' | 'ACCOUNTANT'; status: 'active' | 'pending' | 'inactive' }>([
    ['mr1', { id: 'mr1', role: 'FIELD', status: 'active' }],
    ['mr2', { id: 'mr2', role: 'FIELD', status: 'active' }],
    ['admin', { id: 'admin', role: 'ADMIN', status: 'active' }],
    ['gone', { id: 'gone', role: 'FIELD', status: 'inactive' }],
  ]);
  async findUserSummary(id: string) {
    return this.users.get(id) ?? null;
  }
}

export class FakeConfig implements ConfigReader {
  values: Record<string, string> = {
    SYNC_MAX_BATCH: '500',
    SYNC_MAX_AGE_DAYS: '7',
    SYNC_CLOCK_SKEW_MINUTES: '10',
    SYNC_DRAFT_TTL_DAYS: '30',
    SYNC_MAX_DRAFT_BYTES: '65536',
    SYNC_MAX_DRAFTS: '2000',
  };
  async get(key: string) {
    const v = this.values[key];
    if (v === undefined) throw new Error(`missing ${key}`);
    return v;
  }
}

/** A record kind for tests: `CALL` creates a row in `store`, and its payload can ask it to misbehave. */
export interface CallPayload {
  name?: string;
  refuse?: string;
  crash?: boolean;
  /** Fail after writing, to prove the write is undone. */
  failAfterWrite?: boolean;
  /** Returned to the phone as the server's version of the record. */
  data?: unknown;
}

export function makeKit(nowIso = '2026-10-05T12:00:00Z') {
  const store: Array<{ id: string; clientId: string; userId: string; name: string }> = [];
  const applied: string[] = [];
  const registry = new SyncHandlerRegistry();
  const callHandler: SyncHandlerDefinition = {
    kind: 'CALL',
    async apply(input: SyncApplyContext, ctx: unknown) {
      const payload = (input.payload ?? {}) as CallPayload;
      applied.push(input.clientId);
      if (payload.refuse) {
        const { SyncRejection } = await import('../../domain/syncHandler.js');
        throw new SyncRejection('SAMPLES_EXHAUSTED', payload.refuse);
      }
      if (payload.crash) throw new Error('boom: connection string mongodb://secret');
      const row = { id: `call-${store.length + 1}`, clientId: input.clientId, userId: input.userId, name: payload.name ?? 'call' };
      store.push(row);
      (ctx as FakeTx).undo.push(() => {
        store.splice(store.indexOf(row), 1);
      });
      if (payload.failAfterWrite) throw new Error('after the write');
      return { serverId: row.id, ...(payload.data !== undefined && { data: payload.data }) };
    },
  };
  registry.register(callHandler);
  const receipts = new FakeReceipts();
  const users = new FakeUsers();
  const config = new FakeConfig();
  const clock = { current: new Date(nowIso) };
  const drafts = new FakeDrafts();
  const push = new PushRecordsUseCase(registry, receipts, drafts, new FakeTransactions(), users, config, () => clock.current);
  const putDrafts = new PutDraftsUseCase(drafts, receipts, users, config, () => clock.current);
  const listDrafts = new ListDraftsUseCase(drafts, receipts);
  return { store, applied, registry, receipts, drafts, users, config, clock, push, putDrafts, listDrafts };
}

let counter = 0;
/** A valid-looking UUID, stable per call order. */
export const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export const draft = (over: Partial<{ clientId: string; kind: string; clientUpdatedAt: Date; payload: unknown }> = {}) => ({
  clientId: uuid(),
  kind: 'CALL',
  clientUpdatedAt: new Date('2026-10-05T10:00:00Z'),
  payload: { name: 'draft' } as unknown,
  deleted: false as const,
  ...over,
});
export const removal = (clientId: string, at: string) => ({ clientId, clientUpdatedAt: new Date(at), deleted: true as const });

export const record = (over: Partial<{ clientId: string; kind: string; dependsOn: string[]; clientCreatedAt: Date; payload: unknown }> = {}) => ({
  clientId: uuid(),
  kind: 'CALL',
  dependsOn: [] as string[],
  clientCreatedAt: new Date('2026-10-05T09:00:00Z'),
  payload: {} as unknown,
  ...over,
});
