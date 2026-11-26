import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { resolvePlace } from '../requireActiveRoute.js';
import { requireUniquePhone } from '../phoneUniqueness.js';

export class CreateChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  /** On an active place (2026-11-26); an older client may send a route, whose To place is used. */
  async execute(input: Pick<Chemist, 'name' | 'address' | 'location'> & Partial<Pick<Chemist, 'phone' | 'placeId' | 'routeId'>>): Promise<Chemist> {
    const where = await resolvePlace(this.territory, input);
    await requireUniquePhone((phone, exclude) => this.chemists.findByPhone(phone, exclude), input.phone, 'chemist');
    return this.chemists.create({ phone: null, ...input, ...where, capturedLocation: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: null });
  }
}
