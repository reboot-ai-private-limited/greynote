import { AppError } from '@/shared/errors/AppError.js';
import type { Designation } from '../../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';

export class CreateDesignationUseCase {
  constructor(private readonly repository: DesignationRepositoryPort) {}

  async execute(input: Omit<Designation, 'id'>): Promise<Designation> {
    if (await this.repository.findByName(input.name)) {
      throw AppError.conflict('That designation already exists.', { field: 'name' });
    }
    return this.repository.create(input);
  }
}
