import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveRepositoryPort } from '../../domain/leave.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { isHrOrAdmin, type Actor } from '../actor.js';
import type { LeaveView, LeaveViews } from '../leaveViews.js';

/** One leave — its owner, anyone above them in the chain, HR and Admin. */
export class GetLeaveUseCase {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: LeaveViews,
  ) {}

  async execute(actor: Actor, id: string): Promise<LeaveView> {
    const leave = await this.leaves.findById(id);
    if (!leave) throw AppError.notFound('No such leave.');
    if (actor.id !== leave.userId && !isHrOrAdmin(actor)) {
      const chain = await this.users.getManagerChain(leave.userId);
      if (!chain.some((m) => m.id === actor.id)) throw AppError.forbidden();
    }
    return this.views.one(leave);
  }
}
