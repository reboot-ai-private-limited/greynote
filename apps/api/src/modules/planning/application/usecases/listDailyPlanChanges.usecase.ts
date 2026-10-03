import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { DailyPlanChange } from '../../domain/dailyPlanChange.entity.js';
import type { DailyPlanChangeRepositoryPort } from '../../domain/dailyPlanChange.repository.port.js';
import { DAILY_PLAN_CHANGE_KIND } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertCanRead, type Actor } from '../planAccess.js';

export type DailyPlanChangeView = DailyPlanChange & {
  status: string;
  approval: { requestId: string; cycle: number; submittedAt: Date; decidedAt: Date | null } | null;
};

async function toView(approvals: ApprovalsPort, change: DailyPlanChange): Promise<DailyPlanChangeView> {
  const request = await approvals.getForRecord(DAILY_PLAN_CHANGE_KIND, change.id);
  return {
    ...change,
    status: request?.status ?? 'SUBMITTED',
    approval: request && { requestId: request.id, cycle: request.cycle, submittedAt: request.submittedAt, decidedAt: request.decidedAt },
  };
}

/** A plan's in-day changes, newest first, with where each is in its approval — the owner, their managers, Admin. */
export class ListDailyPlanChangesUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly changes: DailyPlanChangeRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, planId: string): Promise<DailyPlanChangeView[]> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    await assertCanRead(this.users, actor, plan.userId);
    return Promise.all((await this.changes.listForPlan(plan.id)).map((change) => toView(this.approvals, change)));
  }
}

/**
 * One change by its own id — what an approval request points at (`recordId`), which the list above cannot find
 * without the plan's id. Same readers as the list: the owner, their managers, Admin; anyone else is refused.
 */
export class GetDailyPlanChangeUseCase {
  constructor(
    private readonly changes: DailyPlanChangeRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, changeId: string): Promise<DailyPlanChangeView> {
    const change = await this.changes.findById(changeId);
    if (!change) throw AppError.notFound('No such change.');
    await assertCanRead(this.users, actor, change.userId);
    return toView(this.approvals, change);
  }
}
