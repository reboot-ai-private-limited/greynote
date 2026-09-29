import { AppError } from '@/shared/errors/AppError.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { requireFieldUser } from '../distributorRules.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

/** Admin edits a Distributor — moves it to another active Route, reassigns its MR / ASM (`null` clears), or (de)activates it. */
export class UpdateDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(id: string, change: Partial<Omit<Distributor, 'id'>>): Promise<Distributor> {
    const current = await this.distributors.findById(id);
    if (!current) throw AppError.notFound('No such distributor.');
    if (change.routeId !== undefined && change.routeId !== current.routeId) await requireActiveRoute(this.territory, change.routeId);
    // Only a person newly put in charge is checked — someone already there who has since gone inactive can stay until Admin moves them.
    if (change.assignedMrId !== undefined && change.assignedMrId !== current.assignedMrId) {
      await requireFieldUser(this.users, change.assignedMrId, 'assignedMrId');
    }
    if (change.assignedAsmId !== undefined && change.assignedAsmId !== current.assignedAsmId) {
      await requireFieldUser(this.users, change.assignedAsmId, 'assignedAsmId');
    }
    const updated = await this.distributors.update(id, change);
    if (!updated) throw AppError.notFound('No such distributor.');
    return updated;
  }
}
