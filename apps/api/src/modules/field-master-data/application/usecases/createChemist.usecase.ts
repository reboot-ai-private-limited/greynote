import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { resolvePlace } from '../requireActiveRoute.js';
import { requireUniquePhone } from '../phoneUniqueness.js';
import { assignAfterCreate, type AssignNew } from '../assignAfterCreate.js';

export class CreateChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly assign?: AssignNew,
  ) {}

  /** On an active place (2026-11-26); an older client may send a route, whose To place is used. Held by the MR picked, if any (2026-11-27). */
  async execute(
    { assignToUserId, ...input }: Pick<Chemist, 'name' | 'address' | 'location'> & Partial<Pick<Chemist, 'phone' | 'placeId' | 'routeId'>> & { assignToUserId?: string | null | undefined },
    adminId?: string,
  ): Promise<Chemist & { assignError: string | null }> {
    const where = await resolvePlace(this.territory, input);
    await requireUniquePhone((phone, exclude) => this.chemists.findByPhone(phone, exclude), input.phone, 'chemist');
    const chemist = await this.chemists.create({ phone: null, ...input, ...where, capturedLocation: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: null });
    const assignError = adminId ? await assignAfterCreate(this.assign, chemist.id, assignToUserId, adminId) : null;
    return { ...chemist, assignError };
  }
}
