import type { CachedSource, OutboxRecord, OutboxStatus, Store, SyncKind } from './types';

/** In-memory store: used by the web build (see store.web.ts), where SQLite needs extra bundler setup. */
export class MemoryStore implements Store {
  private records = new Map<string, OutboxRecord>();
  private cache = new Map<string, CachedSource>();
  private meta = new Map<string, string>();
  private order = 0;
  private seq = new Map<string, number>();

  async upsertRecord(r: OutboxRecord) {
    if (!this.seq.has(r.clientId)) this.seq.set(r.clientId, this.order++);
    this.records.set(r.clientId, structuredClone(r));
  }
  async getRecord(id: string) {
    const r = this.records.get(id);
    return r ? structuredClone(r) : null;
  }
  async listRecords(filter: { status?: OutboxStatus | OutboxStatus[]; kind?: SyncKind } = {}) {
    const statuses = filter.status ? (Array.isArray(filter.status) ? filter.status : [filter.status]) : null;
    return [...this.records.values()]
      .filter((r) => !r.deleted && (!statuses || statuses.includes(r.status)) && (!filter.kind || r.kind === filter.kind))
      .sort(
        (a, b) =>
          a.clientCreatedAt.localeCompare(b.clientCreatedAt) || this.seq.get(a.clientId)! - this.seq.get(b.clientId)!,
      )
      .map((r) => structuredClone(r));
  }
  async listTombstones() {
    return [...this.records.values()].filter((r) => r.deleted).map((r) => structuredClone(r));
  }
  async purgeRecords(ids: string[]) {
    ids.forEach((id) => {
      this.records.delete(id);
      this.seq.delete(id);
    });
  }
  async getCache(source: string) {
    const c = this.cache.get(source);
    return c ? structuredClone(c) : null;
  }
  async setCache(source: string, entry: CachedSource) {
    this.cache.set(source, structuredClone(entry));
  }
  async touchCache(source: string, fetchedAt: string) {
    const c = this.cache.get(source);
    if (c) c.fetchedAt = fetchedAt;
  }
  async listCacheVersions() {
    return Object.fromEntries([...this.cache].map(([s, c]) => [s, c.version]));
  }
  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }
  async clearAll() {
    this.records.clear();
    this.cache.clear();
    this.meta.clear();
    this.seq.clear();
  }
}
