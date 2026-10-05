import { AppError } from '@/shared/errors/AppError.js';
import { isPaise } from '@/shared/money/paise.js';
import { PAY_BAND_MONEY_FIELDS, ctcRangeProblem, type PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';

export function assertValidPayBandMoney(input: Pick<PayBand, (typeof PAY_BAND_MONEY_FIELDS)[number]>): void {
  for (const field of PAY_BAND_MONEY_FIELDS) {
    if (!isPaise(input[field])) throw AppError.badRequest(`${field} must be a whole number of paise.`, { field });
  }
  const problem = ctcRangeProblem(input);
  if (problem) throw AppError.badRequest(problem, { field: 'ctcMinAnnualPaise' });
}

export class CreatePayBandUseCase {
  constructor(private readonly repository: PayBandRepositoryPort) {}

  async execute(input: Omit<PayBand, 'id'>): Promise<PayBand> {
    assertValidPayBandMoney(input);
    if (await this.repository.findByName(input.name)) {
      throw AppError.conflict('A pay grade with that name already exists.', { field: 'name' });
    }
    return this.repository.create(input);
  }
}
