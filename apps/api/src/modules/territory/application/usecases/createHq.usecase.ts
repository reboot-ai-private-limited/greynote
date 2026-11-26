import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';
import type { PlaceRoutes } from './placeRoutes.js';

/** An HQ, and its town place (decision-log 2026-11-26) so routes can start from it straight away. */
export class CreateHqUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly placeRoutes: PlaceRoutes,
  ) {}

  async execute(input: { zoneId: string; name: string }): Promise<Hq> {
    assertParentUsable(await this.zones.findById(input.zoneId), 'zoneId', 'zone');
    assertNameFree(await this.hqs.findByName(input.zoneId, input.name), 'HQ');
    const hq = await this.hqs.create({ zoneId: input.zoneId, name: input.name, status: 'active' });
    await this.placeRoutes.ensureHqTown(hq);
    return hq;
  }
}
