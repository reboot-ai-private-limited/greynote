import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { requireActiveRoute } from '../requireActiveRoute.js';
import { requireUniquePhone } from '../phoneUniqueness.js';

export class CreateChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(input: Pick<Chemist, 'routeId' | 'name' | 'address' | 'location'> & Partial<Pick<Chemist, 'phone'>>): Promise<Chemist> {
    await requireActiveRoute(this.territory, input.routeId);
    await requireUniquePhone((phone, exclude) => this.chemists.findByPhone(phone, exclude), input.phone, 'chemist');
    return this.chemists.create({ phone: null, ...input, capturedLocation: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: null });
  }
}
