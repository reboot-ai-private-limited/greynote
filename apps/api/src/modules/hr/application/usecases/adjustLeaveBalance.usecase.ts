import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveBalanceRepositoryPort } from '../../domain/leaveBalance.repository.port.js';
import type { LeaveBalances, LeaveBalanceView } from '../leaveBalances.js';

/**
 * HR sets one employee's allocation for a paid type and leave year — a one-off top-up or cut that
 * doesn't touch the Leave Master. Never below what's already used or pending.
 */
export class AdjustLeaveBalanceUseCase {
  constructor(
    private readonly repository: LeaveBalanceRepositoryPort,
    private readonly balances: LeaveBalances,
  ) {}

  async execute(input: {
    userId: string;
    leaveTypeId: string;
    year: number;
    allocatedDays: number;
    reason: string;
    actorId: string;
  }): Promise<LeaveBalanceView> {
    const seeded = await this.balances.ensureSeeded(input.userId, input.year);
    if (seeded.length === 0) throw AppError.badRequest('This employee has no Pay Band, so no leave balances.', { field: 'userId' });
    const key = { userId: input.userId, leaveTypeId: input.leaveTypeId, year: input.year };
    if (!seeded.some((b) => b.leaveTypeId === input.leaveTypeId)) {
      throw AppError.badRequest('Only paid leave types have a balance.', { field: 'leaveTypeId' });
    }
    const updated = await this.repository.setAllocated(key, input.allocatedDays, input.actorId, input.reason);
    if (!updated) {
      throw AppError.conflict('The allocation can’t go below the days already used or waiting for approval.', {
        field: 'allocatedDays',
      });
    }
    return (await this.balances.views(input.userId, input.year)).find((b) => b.leaveTypeId === input.leaveTypeId)!;
  }
}
