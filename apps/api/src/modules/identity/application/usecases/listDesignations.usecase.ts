import type { Designation } from '../../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';

export class ListDesignationsUseCase {
  constructor(private readonly repository: DesignationRepositoryPort) {}

  execute(): Promise<Designation[]> {
    return this.repository.list();
  }
}
