import { AppError } from '@/shared/errors/AppError.js';
import type { PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** Used by TA/DA auto-calculation (hld/06) and Payroll — both need a FIELD user's pay-band rates. */
export class GetPayBandRatesUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly payBandRepository: PayBandRepositoryPort,
  ) {}

  async execute(userId: string): Promise<PayBand> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();

    if (!user.payBandId) {
      throw AppError.badRequest('This user has no pay band assigned.', { field: 'payBandId' });
    }

    const payBand = await this.payBandRepository.findById(user.payBandId);
    if (!payBand) throw AppError.internal('INTERNAL', { reason: 'PAY_BAND_NOT_FOUND', payBandId: user.payBandId });

    return payBand;
  }
}
