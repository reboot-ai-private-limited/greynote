import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';

export class CreateHqUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
  ) {}

  async execute(input: { zoneId: string; name: string }): Promise<Hq> {
    assertParentUsable(await this.zones.findById(input.zoneId), 'zoneId', 'zone');
    assertNameFree(await this.hqs.findByName(input.zoneId, input.name), 'HQ');
    return this.hqs.create({ zoneId: input.zoneId, name: input.name, status: 'active' });
  }
}
