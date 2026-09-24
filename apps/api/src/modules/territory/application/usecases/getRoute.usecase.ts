import { AppError } from '@/shared/errors/AppError.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';

export class GetRouteUseCase {
  constructor(private readonly routes: RouteRepositoryPort) {}

  async execute(id: string): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();
    return route;
  }
}
