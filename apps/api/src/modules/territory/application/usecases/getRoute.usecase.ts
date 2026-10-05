import { AppError } from '@/shared/errors/AppError.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';

export class GetRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(id: string): Promise<RouteWithWarning> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();
    return this.typeRules.annotate(route);
  }
}
