import type { PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';

export class ListPayBandsUseCase {
  constructor(private readonly repository: PayBandRepositoryPort) {}

  execute(): Promise<PayBand[]> {
    return this.repository.list();
  }
}
