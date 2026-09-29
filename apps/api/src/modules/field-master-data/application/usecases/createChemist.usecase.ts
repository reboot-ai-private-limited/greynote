import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export class CreateChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(input: Pick<Chemist, 'routeId' | 'name' | 'address' | 'location'>): Promise<Chemist> {
    await requireActiveRoute(this.territory, input.routeId);
    return this.chemists.create({ ...input, status: 'active' });
  }
}
