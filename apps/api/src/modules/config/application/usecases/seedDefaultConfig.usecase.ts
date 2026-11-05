import { CONFIG_DEFINITIONS } from '../../domain/configDefinitions.js';
import type { SystemConfigSeed } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

/**
 * Every known key, seeded even before the module that reads it exists (most are named in
 * docs/erd/05-planning-and-rules.md) — `Config`'s whole point is being the one source of truth,
 * and seeding early costs nothing. `upsertSeed` only adds missing keys, never overwrites a value
 * Admin has changed.
 */
export const DEFAULT_CONFIG: SystemConfigSeed[] = CONFIG_DEFINITIONS.map((d) => ({
  key: d.key,
  value: d.default,
  module: d.module,
  description: d.description,
}));

export class SeedDefaultConfigUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  /** Adds every setting that has no row yet, with its default; returns the keys it added (none when the database is up to date). */
  async execute(): Promise<string[]> {
    return this.repository.upsertSeed(DEFAULT_CONFIG);
  }
}
