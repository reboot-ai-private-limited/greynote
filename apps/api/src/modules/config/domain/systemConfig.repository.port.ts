import type { SystemConfigEntry, SystemConfigSeed } from './systemConfig.entity.js';

export interface SystemConfigRepositoryPort {
  findByKey(key: string): Promise<SystemConfigEntry | null>;
  /**
   * Upserts each seed entry only if its key doesn't already exist (`$setOnInsert`-style) —
   * never overwrites a value an Admin has since edited.
   */
  upsertSeed(entries: SystemConfigSeed[]): Promise<void>;
}
