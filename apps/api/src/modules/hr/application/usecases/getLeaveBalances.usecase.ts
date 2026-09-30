import { AppError } from '@/shared/errors/AppError.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { isHrOrAdmin, type Actor } from '../actor.js';
import type { HrCalendar } from '../hrCalendar.js';
import type { LeaveBalances, LeaveBalanceView } from '../leaveBalances.js';

/**
 * An employee's balances for a leave year (the current one by default). Readable by the employee,
 * anyone above them in the chain, HR and Admin.
 */
export class GetLeaveBalancesUseCase {
  constructor(
    private readonly balances: LeaveBalances,
    private readonly users: UserDirectoryPort,
    private readonly calendar: HrCalendar,
  ) {}

  async execute(actor: Actor, userId: string, year?: number): Promise<{ year: number; balances: LeaveBalanceView[] }> {
    if (actor.id !== userId && !isHrOrAdmin(actor)) {
      const chain = await this.users.getManagerChain(userId);
      if (!chain.some((m) => m.id === actor.id)) throw AppError.forbidden();
    }
    const currentYear = await this.calendar.leaveYearOf(await this.calendar.today());
    const leaveYear = year ?? currentYear;
    // A year that is over is only ever read: balances are seeded the first time they are needed, never after the fact.
    return { year: leaveYear, balances: await this.balances.views(userId, leaveYear, { seed: leaveYear >= currentYear }) };
  }
}
