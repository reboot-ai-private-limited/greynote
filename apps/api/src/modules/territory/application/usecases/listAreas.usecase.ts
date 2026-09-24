import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Area, AreaType } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { TerritoryListQuery } from '../../domain/territoryStatus.js';

export class ListAreasUseCase {
  constructor(private readonly areas: AreaRepositoryPort) {}

  async execute(
    query: TerritoryListQuery & { hqId?: string | undefined; type?: AreaType | undefined },
  ): Promise<PaginatedResult<Area>> {
    const { items, total } = await this.areas.list(query);
    return buildPaginatedResult(items, total, query);
  }
}
