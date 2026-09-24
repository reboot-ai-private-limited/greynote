import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { TerritoryListQuery } from '../../domain/territoryStatus.js';
import type { Zone } from '../../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';

export class ListZonesUseCase {
  constructor(private readonly zones: ZoneRepositoryPort) {}

  async execute(query: TerritoryListQuery): Promise<PaginatedResult<Zone>> {
    const { items, total } = await this.zones.list(query);
    return buildPaginatedResult(items, total, query);
  }
}
