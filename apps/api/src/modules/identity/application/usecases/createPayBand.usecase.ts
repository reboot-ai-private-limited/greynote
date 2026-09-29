import { AppError } from '@/shared/errors/AppError.js';
import { isPaise } from '@/shared/money/paise.js';
import { PAY_BAND_MONEY_FIELDS, type PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';

function assertValidMoney(input: Omit<PayBand, 'id'>): void {
  for (const field of PAY_BAND_MONEY_FIELDS) {
    if (!isPaise(input[field])) throw AppError.badRequest(`${field} must be a whole number of paise.`, { field });
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
