import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { findConfigDefinition, validateConfigValue } from '../../domain/configDefinitions.js';
import type { SystemConfigEntry } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

/** The two plan times that must stay in order: a rejected plan cannot be resubmitted before its own deadline has passed. */
const DEADLINE_KEY = 'DAILY_PLAN_SUBMIT_CUTOFF_TIME';
const LATEST_KEY = 'DAILY_PLAN_RESUBMIT_LATEST_TIME';
/** The two route-distance thresholds: Out-station must start beyond Ex-station. */
const EX_KEY = 'EX_STATION_MIN_KM';
const OUT_KEY = 'OUT_STATION_MIN_KM';

/**
 * Changes one setting. The value is checked against the setting's own definition (type, limits) and stored in the form the readers
 * expect, so what is saved is always something the system can read back: `banana` for a time of day is a `400` here and not a fault on
 * every later read. The one rule that spans two settings (the latest resubmit time must be after the plan deadline) is checked too.
 *
 * The route already gates this behind `requireRole('ADMIN')`; this re-checks so the guarantee
 * still holds if the use case is ever invoked from somewhere other than the HTTP layer — same
 * defense-in-depth as `unblockUser.usecase.ts`.
 */
export class UpdateConfigValueUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  async execute(
    actingUserId: string,
    actingRole: RoleName,
    key: string,
    value: string,
  ): Promise<SystemConfigEntry> {
    if (actingRole !== 'ADMIN') throw AppError.forbidden();

    const definition = findConfigDefinition(key);
    // A key with no definition is not one an Admin may change, whatever the database holds.
    if (!definition) throw AppError.notFound(`Unknown config key: ${key}`);
    const checked = validateConfigValue(definition, value);
    if (!checked.ok) throw AppError.badRequest(checked.message, { field: 'value', key });
    await this.assertPlanTimesInOrder(key, checked.value);
    await this.assertStationKmInOrder(key, checked.value);

    const updated = await this.repository.updateValue(key, checked.value, actingUserId);
    if (!updated) {
      // Unlike `GetConfigValueUseCase`'s `CONFIG_KEY_MISSING` (a key `seedDefaultConfig` should
      // have created is a violated invariant), an Admin naming an unknown key here is a caller
      // error, not ours — hence `notFound`, not `internal`.
      throw AppError.notFound(`Unknown config key: ${key}`);
    }
    return updated;
  }

  private async assertStationKmInOrder(key: string, value: string): Promise<void> {
    if (key !== EX_KEY && key !== OUT_KEY) return;
    const other = (await this.repository.findByKey(key === EX_KEY ? OUT_KEY : EX_KEY))?.value;
    // As with the plan times, an unreadable other value is flagged on its own and must not block fixing this one.
    if (!other || !/^\d+$/.test(other)) return;
    const ex = Number(key === EX_KEY ? value : other);
    const out = Number(key === OUT_KEY ? value : other);
    if (out <= ex) {
      throw AppError.badRequest(
        key === OUT_KEY
          ? `Out-station (${out} km) must be more than Ex-station (${ex} km).`
          : `Ex-station (${ex} km) must be less than Out-station (${out} km).`,
        { field: 'value', key },
      );
    }
  }

  private async assertPlanTimesInOrder(key: string, value: string): Promise<void> {
    if (key !== DEADLINE_KEY && key !== LATEST_KEY) return;
    const otherKey = key === DEADLINE_KEY ? LATEST_KEY : DEADLINE_KEY;
    const other = (await this.repository.findByKey(otherKey))?.value;
    // The other one may itself be a bad older value; that is flagged on its own and must not block fixing this one.
    if (!other || !/^([01]\d|2[0-3]):[0-5]\d$/.test(other)) return;
    const deadline = key === DEADLINE_KEY ? value : other;
    const latest = key === LATEST_KEY ? value : other;
    if (latest <= deadline) {
      throw AppError.badRequest(
        key === LATEST_KEY
          ? `The latest resubmit time (${latest}) must be after the plan deadline (${deadline}).`
          : `The plan deadline (${deadline}) must be before the latest resubmit time (${latest}).`,
        { field: 'value', key },
      );
    }
  }
}
