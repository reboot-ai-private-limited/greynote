import { AppError } from '@/shared/errors/AppError.js';
import type { RoutePath } from '@/modules/territory/territory.public.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

export type DistributorDetail = Distributor & { path: RoutePath | null };

/** Admin: one Distributor, with its Zone → HQ → Area → Route breadcrumb resolved through its Route (never stored). */
export class GetDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(id: string): Promise<DistributorDetail> {
    const distributor = await this.distributors.findById(id);
    if (!distributor) throw AppError.notFound('No such distributor.');
    return { ...distributor, path: await this.territory.getRoutePath(distributor.routeId) };
  }
}
