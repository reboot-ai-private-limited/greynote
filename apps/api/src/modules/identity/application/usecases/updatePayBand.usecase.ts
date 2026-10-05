import { AppError } from '@/shared/errors/AppError.js';
import type { PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';
import { assertValidPayBandMoney } from './createPayBand.usecase.js';

export class UpdatePayBandUseCase {
  constructor(private readonly repository: PayBandRepositoryPort) {}

  async execute(id: string, input: Partial<Omit<PayBand, 'id'>>): Promise<PayBand> {
    const existing = await this.repository.findById(id);
    if (!existing) throw AppError.notFound();

    // The merged result must still be a usable grade: the range is checked as a whole, not field by field.
    assertValidPayBandMoney({ ...existing, ...input });

    if (input.name !== undefined) {
      const clash = await this.repository.findByName(input.name);
      if (clash && clash.id !== id) throw AppError.conflict('A pay grade with that name already exists.', { field: 'name' });
    }

    return this.repository.update(id, input);
  }
}
