import { AppError } from '@/shared/errors/AppError.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { resolvePlace } from '../requireActiveRoute.js';
import { requireUniquePhone } from '../phoneUniqueness.js';

export class UpdateChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(id: string, change: Partial<Omit<Chemist, 'id'>>): Promise<Chemist> {
    const current = await this.chemists.findById(id);
    if (!current) throw AppError.notFound('No such chemist.');
    if (current.status === 'pending' && change.status !== undefined) {
      throw AppError.conflict('This chemist is waiting for approval. Approve or reject it in Approvals.');
    }
    if (change.phone !== undefined) await requireUniquePhone((phone, exclude) => this.chemists.findByPhone(phone, exclude), change.phone, 'chemist', id);
    // Moving it needs an active place (or, from an older client, a route: its To place). The record keeps both.
    const moving = (change.placeId !== undefined && change.placeId !== current.placeId) || (change.placeId === undefined && change.routeId !== undefined && change.routeId !== current.routeId);
    if (moving) change = { ...change, ...(await resolvePlace(this.territory, change.placeId !== undefined ? { placeId: change.placeId } : { routeId: change.routeId })) };
    else change = Object.fromEntries(Object.entries(change).filter(([k]) => k !== 'placeId' && k !== 'routeId'));
    const updated = await this.chemists.update(id, change);
    if (!updated) throw AppError.notFound('No such chemist.');
    return updated;
  }
}
