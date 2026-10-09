import { AppError } from '@/shared/errors/AppError.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { requireFieldUsers, requireRoutesInOneZone } from '../distributorRules.js';

/** Admin edits a Distributor — changes its Routes (one Zone), its assigned people, or (de)activates it. */
export class UpdateDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(id: string, change: Partial<Omit<Distributor, 'id'>>): Promise<Distributor> {
    const current = await this.distributors.findById(id);
    if (!current) throw AppError.notFound('No such distributor.');
    // A Route already on the Distributor that has since gone inactive can stay; only the whole set must still be in one Zone.
    if (change.routeIds !== undefined) await requireRoutesInOneZone(this.territory, change.routeIds, change.routeIds.filter((id) => !current.routeIds.includes(id)));
    // Only people newly put in charge are checked — someone already there who has since gone inactive can stay until Admin moves them.
    if (change.assignedUserIds !== undefined) {
      await requireFieldUsers(this.users, change.assignedUserIds.filter((id) => !current.assignedUserIds.includes(id)));
    }
    const updated = await this.distributors.update(id, change);
    if (!updated) throw AppError.notFound('No such distributor.');
    return updated;
  }
}
