import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';

/** Contract read: the Route ids under an Area, HQ or Zone (the most specific one given), or `[]` if none is given. */
export class ListRouteIdsInScopeUseCase {
  constructor(private readonly routes: RouteRepositoryPort) {}

  execute(scope: { areaId?: string | undefined; hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]> {
    return this.routes.listIdsInScope(scope);
  }
}
