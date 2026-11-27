import type { SystemConfigEntry, SystemConfigSeed } from '../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../domain/systemConfig.repository.port.js';

/**
 * Settings read from memory for a short while (2026-11-27). Every module reads settings on almost every request — the phone's pull alone
 * read them about 250 times — and each read was a database query. All settings are loaded in one query and kept `ttlMs`; any write here
 * (an Admin's change, the boot seed) drops the copy at once. With several API processes, another process's change shows within `ttlMs`.
 */
export class CachedSystemConfigRepository implements SystemConfigRepositoryPort {
  private copy: { at: number; byKey: Map<string, SystemConfigEntry> } | null = null;
  private loading: Promise<Map<string, SystemConfigEntry>> | null = null;

  constructor(
    private readonly inner: SystemConfigRepositoryPort,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async all(): Promise<Map<string, SystemConfigEntry>> {
    if (this.copy && this.now() - this.copy.at < this.ttlMs) return this.copy.byKey;
    this.loading ??= this.inner
      .list()
      .then((rows) => {
        const byKey = new Map(rows.map((r) => [r.key, r]));
        this.copy = { at: this.now(), byKey };
        return byKey;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  async findByKey(key: string): Promise<SystemConfigEntry | null> {
    return (await this.all()).get(key) ?? null;
  }

  async list(): Promise<SystemConfigEntry[]> {
    return [...(await this.all()).values()];
  }

  async upsertSeed(entries: SystemConfigSeed[]): Promise<string[]> {
    this.copy = null;
    const added = await this.inner.upsertSeed(entries);
    this.copy = null;
    return added;
  }

  async updateValue(key: string, value: string, updatedBy: string): Promise<SystemConfigEntry | null> {
    this.copy = null;
    const updated = await this.inner.updateValue(key, value, updatedBy);
    this.copy = null;
    return updated;
  }
}
