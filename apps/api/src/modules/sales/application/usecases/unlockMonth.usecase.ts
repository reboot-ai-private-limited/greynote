import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { SalesClock } from '../salesClock.js';

/** Admin reopens a month for entry after its deadline (sign-off E2). Idempotent. */
export class UnlockMonthUseCase {
  constructor(
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(adminId: string, month: string): Promise<{ month: string; unlocked: true }> {
    await this.stock.unlock(month, adminId, this.clock.now());
    return { month, unlocked: true };
  }
}
