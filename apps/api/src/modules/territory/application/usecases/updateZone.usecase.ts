import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Zone } from '../../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertNoActiveChildren } from './hierarchyRules.js';

export class UpdateZoneUseCase {
  constructor(
    private readonly zones: ZoneRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(id: string, input: Partial<Omit<Zone, 'id'>>): Promise<Zone> {
    const zone = await this.zones.findById(id);
    if (!zone) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.zones.findByName(input.name), 'zone', id);
    if (input.status === 'inactive' && zone.status === 'active') {
      assertNoActiveChildren(await this.hqs.countActiveInZone(id), 'zone', 'HQs');
    }
    return this.zones.update(id, input);
  }
}
