import type { SystemConfigEntry, SystemConfigSeed } from './systemConfig.entity.js';

export interface SystemConfigRepositoryPort {
  findByKey(key: string): Promise<SystemConfigEntry | null>;
  /** Every stored row, in no particular order. */
  list(): Promise<SystemConfigEntry[]>;
  /**
   * Upserts each seed entry only if its key doesn't already exist (`$setOnInsert`-style) —
   * never overwrites a value an Admin has since edited.
   */
  upsertSeed(entries: SystemConfigSeed[]): Promise<void>;
  /**
   * Updates `value`/`updatedBy`/`updatedAt` for a key that must already exist — never creates
   * one, so an Admin can't accidentally introduce an unrecognized key by typo. Returns `null`
   * when the key doesn't exist, letting the use case decide what that means for its caller.
   */
  updateValue(key: string, value: string, updatedBy: string): Promise<SystemConfigEntry | null>;
}
