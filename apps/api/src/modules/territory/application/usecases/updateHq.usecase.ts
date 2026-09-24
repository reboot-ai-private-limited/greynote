import { AppError } from '@/shared/errors/AppError.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';

/** Name and status only — moving an HQ to another Zone is deliberately not supported (LLD). */
export class UpdateHqUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly areas: AreaRepositoryPort,
  ) {}

  async execute(id: string, input: Partial<Omit<Hq, 'id' | 'zoneId'>>): Promise<Hq> {
    const hq = await this.hqs.findById(id);
    if (!hq) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.hqs.findByName(hq.zoneId, input.name), 'HQ', id);
    if (input.status === 'inactive' && hq.status === 'active') {
      assertNoActiveChildren(await this.areas.countActiveInHq(id), 'HQ', 'areas');
    }
    if (input.status === 'active' && hq.status === 'inactive') {
      assertParentUsable(await this.zones.findById(hq.zoneId), 'zoneId', 'zone');
    }
    return this.hqs.update(id, input);
  }
}
