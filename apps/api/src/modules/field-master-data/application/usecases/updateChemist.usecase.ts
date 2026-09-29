import { AppError } from '@/shared/errors/AppError.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export class UpdateChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(id: string, change: Partial<Omit<Chemist, 'id'>>): Promise<Chemist> {
    const current = await this.chemists.findById(id);
    if (!current) throw AppError.notFound('No such chemist.');
    if (change.routeId !== undefined && change.routeId !== current.routeId) {
      await requireActiveRoute(this.territory, change.routeId);
    }
    const updated = await this.chemists.update(id, change);
    if (!updated) throw AppError.notFound('No such chemist.');
    return updated;
  }
}
