import { AppError } from '@/shared/errors/AppError.js';
import { isValidDecimalString, PAY_BAND_MONEY_FIELDS, type PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';

export class UpdatePayBandUseCase {
  constructor(private readonly repository: PayBandRepositoryPort) {}

  async execute(id: string, input: Partial<Omit<PayBand, 'id'>>): Promise<PayBand> {
    if (!(await this.repository.findById(id))) throw AppError.notFound();

    for (const field of PAY_BAND_MONEY_FIELDS) {
      const value = input[field];
      if (value !== undefined && !isValidDecimalString(value)) {
        throw AppError.badRequest(`${field} must be a non-negative decimal with up to 2 places.`, { field });
      }
    }

    return this.repository.update(id, input);
  }
}
