/** A single `SystemConfig` row — the Admin-editable cutoffs/limits every module reads by key. */
export interface SystemConfigEntry {
  key: string;
  value: string;
  module: string;
  description: string;
  updatedBy: string | null;
  updatedAt: Date;
}

/** A default key this module seeds on boot if it doesn't already exist. */
export interface SystemConfigSeed {
  key: string;
  value: string;
  module: string;
  description: string;
}
