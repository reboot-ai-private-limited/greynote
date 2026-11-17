import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { ChemistAssignmentRepositoryPort } from '../../domain/chemistAssignment.repository.port.js';

/** Admin's chemist list. `assignedUserId` narrows it to the active chemists that employee holds now. */
export class ListChemistsUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly assignments: ChemistAssignmentRepositoryPort,
  ) {}

  async execute(filter: ChemistFilter & { assignedUserId?: string | undefined }): Promise<PaginatedResult<Chemist>> {
    const { assignedUserId, ...rest } = filter;
    if (!assignedUserId) return this.chemists.list(rest);
    const held = (await this.assignments.listActiveForUsers([assignedUserId])).map((a) => a.chemistId);
    const { page, pageSize, search, routeId } = rest;
    return this.chemists.listActiveAmong(held, { search, routeId }, { page, pageSize });
  }
}
