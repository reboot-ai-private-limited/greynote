import { AppError } from '@/shared/errors/AppError.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';

export class GetChemistUseCase {
  constructor(private readonly chemists: ChemistRepositoryPort) {}

  async execute(id: string): Promise<Chemist> {
    const chemist = await this.chemists.findById(id);
    if (!chemist) throw AppError.notFound('No such chemist.');
    return chemist;
  }
}
