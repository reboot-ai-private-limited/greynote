import { AppError } from '@/shared/errors/AppError.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

export class GetConfigValueUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  async execute(key: string): Promise<string> {
    const entry = await this.repository.findByKey(key);
    if (!entry) {
      // A missing KNOWN key (one `seedDefaultConfig` should have created) is a violated
      // invariant, not a caller error — hence `internal`, not `notFound`.
      throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
    }
    return entry.value;
  }
}
