import type { Zone } from '../../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree } from './hierarchyRules.js';

export class CreateZoneUseCase {
  constructor(private readonly zones: ZoneRepositoryPort) {}

  async execute(input: { name: string }): Promise<Zone> {
    assertNameFree(await this.zones.findByName(input.name), 'zone');
    return this.zones.create({ name: input.name, status: 'active' });
  }
}
