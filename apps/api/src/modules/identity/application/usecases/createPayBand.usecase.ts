import { AppError } from '@/shared/errors/AppError.js';
import { isValidDecimalString, PAY_BAND_MONEY_FIELDS, type PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';

function assertValidMoney(input: Omit<PayBand, 'id'>): void {
  for (const field of PAY_BAND_MONEY_FIELDS) {
    if (!isValidDecimalString(input[field])) {
      throw AppError.badRequest(`${field} must be a non-negative decimal with up to 2 places.`, { field });
    }
  }
}

export class CreatePayBandUseCase {
  constructor(private readonly repository: PayBandRepositoryPort) {}

  async execute(input: Omit<PayBand, 'id'>): Promise<PayBand> {
    assertValidMoney(input);
    if (await this.repository.findByName(input.name)) {
      throw AppError.conflict('That pay band already exists.', { field: 'name' });
    }
    return this.repository.create(input);
  }
}
