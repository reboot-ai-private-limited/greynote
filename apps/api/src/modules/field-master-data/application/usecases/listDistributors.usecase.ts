import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { MasterStatus, PageQuery } from '../../domain/masterStatus.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { scopeOfPlace } from '../distributorCoverage.js';

export interface ListDistributorsInput extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  hqId?: string | undefined;
  zoneId?: string | undefined;
  assignedUserId?: string | undefined;
  status?: MasterStatus | undefined;
}

/**
 * Admin: Distributors serving a Route, an HQ or a Zone (the most specific of those given). A Distributor that serves a whole Zone
 * serves every HQ and Route in it, so the place is widened to everything above and below it before matching.
 */
export class ListDistributorsUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(input: ListDistributorsInput): Promise<PaginatedResult<Distributor>> {
    const { routeId, hqId, zoneId, ...rest } = input;
    const scope = routeId || hqId || zoneId ? await scopeOfPlace(this.territory, { routeId, hqId, zoneId }) : undefined;
    if (scope && scope.zoneIds.length + scope.hqIds.length + scope.routeIds.length === 0) return buildPaginatedResult([], 0, input);
    return this.distributors.list({ ...rest, scope });
  }
}
