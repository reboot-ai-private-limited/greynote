import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { SystemConfigEntry } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

/**
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

    const updated = await this.repository.updateValue(key, value, actingUserId);
    if (!updated) {
      // Unlike `GetConfigValueUseCase`'s `CONFIG_KEY_MISSING` (a key `seedDefaultConfig` should
      // have created is a violated invariant), an Admin naming an unknown key here is a caller
      // error, not ours — hence `notFound`, not `internal`.
      throw AppError.notFound(`Unknown config key: ${key}`);
    }
    return updated;
  }
}
