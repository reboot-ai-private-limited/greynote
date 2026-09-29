import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';

export class ListChemistsUseCase {
  constructor(private readonly chemists: ChemistRepositoryPort) {}

  execute(filter: ChemistFilter): Promise<PaginatedResult<Chemist>> {
    return this.chemists.list(filter);
  }
}
