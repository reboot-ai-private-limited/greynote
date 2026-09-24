import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { TerritoryListQuery } from '../../domain/territoryStatus.js';

export class ListHqsUseCase {
  constructor(private readonly hqs: HqRepositoryPort) {}

  async execute(query: TerritoryListQuery & { zoneId?: string | undefined }): Promise<PaginatedResult<Hq>> {
    const { items, total } = await this.hqs.list(query);
    return buildPaginatedResult(items, total, query);
  }
}
