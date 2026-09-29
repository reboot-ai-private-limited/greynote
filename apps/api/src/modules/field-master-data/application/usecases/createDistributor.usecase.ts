import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { requireFieldUser } from '../distributorRules.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export type CreateDistributorInput = Omit<Distributor, 'id' | 'status'>;

/** Admin adds a Distributor on an active Route, optionally handing it to an MR and an ASM. */
export class CreateDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(input: CreateDistributorInput): Promise<Distributor> {
    await requireActiveRoute(this.territory, input.routeId);
    await requireFieldUser(this.users, input.assignedMrId, 'assignedMrId');
    await requireFieldUser(this.users, input.assignedAsmId, 'assignedAsmId');
    return this.distributors.create({ ...input, status: 'active' });
  }
}
