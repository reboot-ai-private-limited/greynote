import { AppError } from '@/shared/errors/AppError.js';
import type { Designation } from '../../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';

export class UpdateDesignationUseCase {
  constructor(private readonly repository: DesignationRepositoryPort) {}

  async execute(id: string, input: Partial<Omit<Designation, 'id'>>): Promise<Designation> {
    if (!(await this.repository.findById(id))) throw AppError.notFound();
    return this.repository.update(id, input);
  }
}
