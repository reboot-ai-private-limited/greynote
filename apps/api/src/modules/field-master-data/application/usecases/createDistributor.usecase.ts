import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { requireFieldUsers, requireCoverage } from '../distributorRules.js';

export type CreateDistributorInput = Omit<Distributor, 'id' | 'status' | 'documents'>;

/** Admin adds a Distributor over any Zones, HQs and Routes, optionally handing it to field employees. Documents are uploaded after, against its id. */
export class CreateDistributorUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(input: CreateDistributorInput): Promise<Distributor> {
    await requireCoverage(this.territory, input);
    await requireFieldUsers(this.users, input.assignedUserIds);
    return this.distributors.create({ ...input, documents: [], status: 'active' });
  }
}
