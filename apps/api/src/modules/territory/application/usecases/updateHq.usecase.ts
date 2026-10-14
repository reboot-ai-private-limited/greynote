import { AppError } from '@/shared/errors/AppError.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { routeNameFor } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';

/**
 * Name and status — moving an HQ to another Zone is deliberately not supported (LLD). Renaming an
 * HQ re-names its Routes ("<HQ> to <destination>"), active or not.
 */
export class UpdateHqUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly routes: RouteRepositoryPort,
  ) {}

  async execute(id: string, input: Partial<Pick<Hq, 'name' | 'status'>>): Promise<Hq> {
    const hq = await this.hqs.findById(id);
    if (!hq) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.hqs.findByName(hq.zoneId, input.name), 'HQ', id);
    if (input.status === 'inactive' && hq.status === 'active') {
      assertNoActiveChildren(await this.routes.countActiveInHq(id), 'HQ', 'routes');
    }
    if (input.status === 'active' && hq.status === 'inactive') {
      assertParentUsable(await this.zones.findById(hq.zoneId), 'zoneId', 'zone');
    }

    const updated = await this.hqs.update(id, input);
    if (input.name !== undefined && input.name !== hq.name) {
      for (const route of await this.routes.listInHq(id)) {
        await this.routes.update(route.id, { name: routeNameFor(updated.name, route.destinationName) });
      }
    }
    return updated;
  }
}
