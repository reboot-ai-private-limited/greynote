import { AppError } from '@/shared/errors/AppError.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { requireFieldUsers, requireCoverage } from '../distributorRules.js';

/** Admin edits a Distributor — changes its coverage, its assigned people, or (de)activates it. */
export class UpdateDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(id: string, change: Partial<Omit<Distributor, 'id' | 'documents'>>): Promise<Distributor> {
    const current = await this.distributors.findById(id);
    if (!current) throw AppError.notFound('No such distributor.');
    // A Zone, HQ or Route already on the Distributor that has since gone inactive can stay; only newly added ones must be active.
    if (change.zoneIds !== undefined || change.hqIds !== undefined || change.routeIds !== undefined) {
      await requireCoverage(
        this.territory,
        { zoneIds: change.zoneIds ?? current.zoneIds, hqIds: change.hqIds ?? current.hqIds, routeIds: change.routeIds ?? current.routeIds },
        current,
      );
    }
    // Only people newly put in charge are checked — someone already there who has since gone inactive can stay until Admin moves them.
    if (change.assignedUserIds !== undefined) {
      await requireFieldUsers(this.users, change.assignedUserIds.filter((id) => !current.assignedUserIds.includes(id)));
    }
    const updated = await this.distributors.update(id, change);
    if (!updated) throw AppError.notFound('No such distributor.');
    return updated;
  }
}
