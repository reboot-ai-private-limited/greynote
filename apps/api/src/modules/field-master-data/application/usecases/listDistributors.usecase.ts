import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { MasterStatus, PageQuery } from '../../domain/masterStatus.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

export interface ListDistributorsInput extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  hqId?: string | undefined;
  zoneId?: string | undefined;
  assignedMrId?: string | undefined;
  status?: MasterStatus | undefined;
}

/**
 * Admin: Distributors by Route, or by the HQ / Zone above it (the most specific of those
 * given), resolved to Route ids through Territory since a Distributor stores only its Route.
 */
export class ListDistributorsUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(input: ListDistributorsInput): Promise<PaginatedResult<Distributor>> {
    const { routeId, hqId, zoneId, ...rest } = input;
    let routeIds: string[] | undefined;
    if (hqId || zoneId) routeIds = await this.territory.listRouteIdsInScope({ hqId, zoneId });
    if (routeId) routeIds = routeIds ? routeIds.filter((id) => id === routeId) : [routeId];
    if (routeIds && routeIds.length === 0) return buildPaginatedResult([], 0, input);
    return this.distributors.list({ ...rest, routeIds });
  }
}
