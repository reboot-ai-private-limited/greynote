import { AppError } from '@/shared/errors/AppError.js';
import type { RoleName } from '@greynote/contracts';
import {
  CONFIG_DEFINITIONS,
  CONFIG_MODULE_LABEL,
  validateConfigValue,
  type ConfigDefinition,
} from '../../domain/configDefinitions.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { MONTH_NAMES, WEEKDAY_NAMES } from '@/shared/time/businessTime.js';

/** One setting as the settings screen needs it: what it is, its rules, its value now, and whether that value is one the system can read. */
export interface ConfigSettingView {
  key: string;
  module: string;
  moduleLabel: string;
  label: string;
  description: string;
  type: ConfigDefinition['type'];
  min: number | null;
  max: number | null;
  unit: string | null;
  /** The names a MONTH or WEEKDAY setting chooses from; otherwise `null`. */
  options: readonly string[] | null;
  default: string;
  impact: ConfigDefinition['impact'];
  impactNote: string | null;
  /** What is stored, exactly. */
  value: string;
  isDefault: boolean;
  /** False when the stored value breaks its own rules (an older value from before they were checked), which would fail every read of it. */
  valid: boolean;
  invalidReason: string | null;
  /** The Admin who last changed it, or `null` while it is still the seeded default. */
  updatedBy: string | null;
  updatedAt: Date;
}

const OPTIONS: Partial<Record<ConfigDefinition['type'], readonly string[]>> = { MONTH: MONTH_NAMES, WEEKDAY: WEEKDAY_NAMES };

/**
 * Every defined setting with its stored value, in the registry's order (which groups them by module). A stored row with no definition is
 * not listed: the registry is the list of what an Admin may change. A defined setting with no stored row is also left out; the seed
 * creates them at boot, so that is a setup fault and not something to paper over with the default here.
 */
export class ListConfigUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  async execute(actingRole: RoleName): Promise<ConfigSettingView[]> {
    if (actingRole !== 'ADMIN') throw AppError.forbidden();
    const stored = new Map((await this.repository.list()).map((e) => [e.key, e]));
    const out: ConfigSettingView[] = [];
    for (const def of CONFIG_DEFINITIONS) {
      if (def.managedBy) continue; // changed through its own action, not on the settings list
      const entry = stored.get(def.key);
      if (!entry) continue;
      const check = validateConfigValue(def, entry.value);
      // A value that only differs in spelling (`april`) is still a fault: the readers compare exactly.
      const valid = check.ok && check.value === entry.value;
      out.push({
        key: def.key,
        module: def.module,
        moduleLabel: CONFIG_MODULE_LABEL[def.module] ?? def.module,
        label: def.label,
        description: def.description,
        type: def.type,
        min: def.min ?? null,
        max: def.max ?? null,
        unit: def.unit ?? null,
        options: OPTIONS[def.type] ?? null,
        default: def.default,
        impact: def.impact,
        impactNote: def.impactNote ?? null,
        value: entry.value,
        isDefault: entry.value === def.default,
        valid,
        invalidReason: valid ? null : check.ok ? `Stored as "${entry.value}", but the system reads it as "${check.value}".` : check.message,
        updatedBy: entry.updatedBy,
        updatedAt: entry.updatedAt,
      });
    }
    return out;
  }
}
