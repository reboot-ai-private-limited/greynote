import * as SQLite from 'expo-sqlite';

import type { CachedSource, OutboxRecord, OutboxStatus, Store, SyncKind } from './types';

/** The local store on phones: SQLite via expo-sqlite (works in Expo Go). The web build uses memory-store.ts. */

const SCHEMA_VERSION = 1;

type Row = {
  client_id: string;
  kind: string;
  payload: string;
  depends_on: string;
  status: string;
  client_created_at: string;
  client_updated_at: string;
  server_id: string | null;
  server_data: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  deleted: number;
  dirty: number;
};

const toRecord = (r: Row): OutboxRecord => ({
  clientId: r.client_id,
  kind: r.kind as SyncKind,
  payload: JSON.parse(r.payload),
  dependsOn: JSON.parse(r.depends_on),
  status: r.status as OutboxStatus,
  clientCreatedAt: r.client_created_at,
  clientUpdatedAt: r.client_updated_at,
  serverId: r.server_id,
  serverData: r.server_data === null ? null : JSON.parse(r.server_data),
  errorCode: r.error_code,
  errorMessage: r.error_message,
  attempts: r.attempts,
  deleted: r.deleted === 1,
  dirty: r.dirty === 1,
});

export class SqliteStore implements Store {
  private db: Promise<SQLite.SQLiteDatabase> | null = null;

  private open(): Promise<SQLite.SQLiteDatabase> {
    this.db ??= (async () => {
      const db = await SQLite.openDatabaseAsync('greynote.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
        // Version 1. Add a numbered step here (never edit this one) when the schema changes.
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS outbox (
            client_id TEXT PRIMARY KEY NOT NULL,
            kind TEXT NOT NULL,
            payload TEXT NOT NULL,
            depends_on TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL,
            client_created_at TEXT NOT NULL,
            client_updated_at TEXT NOT NULL,
            server_id TEXT,
            server_data TEXT,
            error_code TEXT,
            error_message TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            deleted INTEGER NOT NULL DEFAULT 0,
            dirty INTEGER NOT NULL DEFAULT 1
          );
          CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, client_created_at);
          CREATE TABLE IF NOT EXISTS cache (
            source TEXT PRIMARY KEY NOT NULL,
            version TEXT NOT NULL,
            data TEXT NOT NULL,
            fetched_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          );
          PRAGMA user_version = ${SCHEMA_VERSION};
        `);
      }
      return db;
    })();
    return this.db;
  }

  async upsertRecord(r: OutboxRecord) {
    const db = await this.open();
    await db.runAsync(
      `INSERT OR REPLACE INTO outbox (client_id, kind, payload, depends_on, status, client_created_at,
         client_updated_at, server_id, server_data, error_code, error_message, attempts, deleted, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.clientId,
      r.kind,
      JSON.stringify(r.payload ?? null),
      JSON.stringify(r.dependsOn),
      r.status,
      r.clientCreatedAt,
      r.clientUpdatedAt,
      r.serverId,
      r.serverData === null || r.serverData === undefined ? null : JSON.stringify(r.serverData),
      r.errorCode,
      r.errorMessage,
      r.attempts,
      r.deleted ? 1 : 0,
      r.dirty ? 1 : 0,
    );
  }

  async getRecord(clientId: string) {
    const db = await this.open();
    const row = await db.getFirstAsync<Row>('SELECT * FROM outbox WHERE client_id = ?', clientId);
    return row ? toRecord(row) : null;
  }

  async listRecords(filter: { status?: OutboxStatus | OutboxStatus[]; kind?: SyncKind } = {}) {
    const db = await this.open();
    const where = ['deleted = 0'];
    const args: string[] = [];
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.push(`status IN (${statuses.map(() => '?').join(',')})`);
      args.push(...statuses);
    }
    if (filter.kind) {
      where.push('kind = ?');
      args.push(filter.kind);
    }
    const rows = await db.getAllAsync<Row>(
      `SELECT * FROM outbox WHERE ${where.join(' AND ')} ORDER BY client_created_at, rowid`,
      ...args,
    );
    return rows.map(toRecord);
  }

  async listTombstones() {
    const db = await this.open();
    const rows = await db.getAllAsync<Row>('SELECT * FROM outbox WHERE deleted = 1');
    return rows.map(toRecord);
  }

  async purgeRecords(clientIds: string[]) {
    if (clientIds.length === 0) return;
    const db = await this.open();
    await db.runAsync(
      `DELETE FROM outbox WHERE client_id IN (${clientIds.map(() => '?').join(',')})`,
      ...clientIds,
    );
  }

  async getCache(source: string) {
    const db = await this.open();
    const row = await db.getFirstAsync<{ version: string; data: string; fetched_at: string }>(
      'SELECT version, data, fetched_at FROM cache WHERE source = ?',
      source,
    );
    return row ? { version: row.version, data: JSON.parse(row.data), fetchedAt: row.fetched_at } : null;
  }

  async setCache(source: string, entry: CachedSource) {
    const db = await this.open();
    await db.runAsync(
      'INSERT OR REPLACE INTO cache (source, version, data, fetched_at) VALUES (?, ?, ?, ?)',
      source,
      entry.version,
      JSON.stringify(entry.data ?? null),
      entry.fetchedAt,
    );
  }

  async listCacheVersions() {
    const db = await this.open();
    const rows = await db.getAllAsync<{ source: string; version: string }>('SELECT source, version FROM cache');
    return Object.fromEntries(rows.map((r) => [r.source, r.version]));
  }

  async getMeta(key: string) {
    const db = await this.open();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    const db = await this.open();
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  async clearAll() {
    const db = await this.open();
    await db.execAsync('DELETE FROM outbox; DELETE FROM cache; DELETE FROM meta;');
  }
}
