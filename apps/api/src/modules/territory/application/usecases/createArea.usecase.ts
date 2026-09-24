import type { Area, AreaType } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';

export class CreateAreaUseCase {
  constructor(
    private readonly areas: AreaRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(input: { hqId: string; name: string; type: AreaType }): Promise<Area> {
    assertParentUsable(await this.hqs.findById(input.hqId), 'hqId', 'HQ');
    assertNameFree(await this.areas.findByName(input.hqId, input.name), 'area');
    return this.areas.create({ ...input, status: 'active' });
  }
}
