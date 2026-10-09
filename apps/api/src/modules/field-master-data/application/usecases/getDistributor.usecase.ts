import { AppError } from '@/shared/errors/AppError.js';
import type { RoutePath } from '@/modules/territory/territory.public.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

export type DistributorDetail = Distributor & { paths: RoutePath[] };

/** Admin: one Distributor, with the Zone → HQ → Route place of each of its Routes resolved through Territory (never stored). */
export class GetDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(id: string): Promise<DistributorDetail> {
    const distributor = await this.distributors.findById(id);
    if (!distributor) throw AppError.notFound('No such distributor.');
    const paths = await Promise.all(distributor.routeIds.map((id) => this.territory.getRoutePath(id)));
    return { ...distributor, paths: paths.flatMap((p) => (p ? [p] : [])) };
  }
}
