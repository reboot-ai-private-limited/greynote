import { AppError } from '@/shared/errors/AppError.js';
import type { Area } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';

/**
 * Name, `type` and status — not the parent HQ (LLD). A `type` change affects only DA generated
 * after it; past DA rows are snapshots (HLD 06 §3).
 */
export class UpdateAreaUseCase {
  constructor(
    private readonly areas: AreaRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly routes: RouteRepositoryPort,
  ) {}

  async execute(id: string, input: Partial<Omit<Area, 'id' | 'hqId'>>): Promise<Area> {
    const area = await this.areas.findById(id);
    if (!area) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.areas.findByName(area.hqId, input.name), 'area', id);
    if (input.status === 'inactive' && area.status === 'active') {
      assertNoActiveChildren(await this.routes.countActiveInArea(id), 'area', 'routes');
    }
    if (input.status === 'active' && area.status === 'inactive') {
      assertParentUsable(await this.hqs.findById(area.hqId), 'hqId', 'HQ');
    }
    return this.areas.update(id, input);
  }
}
