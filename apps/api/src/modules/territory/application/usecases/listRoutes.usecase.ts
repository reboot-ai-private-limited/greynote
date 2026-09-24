import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteListQuery, RouteRepositoryPort } from '../../domain/route.repository.port.js';

export class ListRoutesUseCase {
  constructor(private readonly routes: RouteRepositoryPort) {}

  async execute(query: RouteListQuery): Promise<PaginatedResult<Route>> {
    const { items, total } = await this.routes.list(query);
    return buildPaginatedResult(items, total, query);
  }
}
