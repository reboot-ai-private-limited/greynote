import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { DailyPlanChange } from '../../domain/dailyPlanChange.entity.js';
import { OpenChangeExistsError, type DailyPlanChangeRepositoryPort } from '../../domain/dailyPlanChange.repository.port.js';
import { DAILY_PLAN_CHANGE_KIND, type PlanDay } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { isPlanApproved } from '../dailyPlanChangeHandler.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';

const sameDay = (a: PlanDay, b: PlanDay): boolean =>
  a.workingType === b.workingType &&
  a.remarks === b.remarks &&
  [...a.routeIds].sort().join() === [...b.routeIds].sort().join() &&
  [...a.workWith].sort().join() === [...b.workWith].sort().join();

/**
 * The employee asks to change today's approved Daily Plan (client §2.6). The change is its own
 * request to their manager: the plan stays approved — the day's gate stays open — until the manager
 * approves it, and the plan only changes then. Refused unless the plan is for today and approved, the
 * employee isn't blocked, nothing is already waiting, and the day's cap on applied changes isn't
 * reached. The deadlines don't apply: an in-day change is after them by nature.
 */
export class RequestDailyPlanChangeUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly changes: DailyPlanChangeRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
    private readonly submitter: PlanSubmitter,
    private readonly deadlines: PlanDeadlines,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(userId: string, planId: string, proposed: PlanDay, reason: string): Promise<DailyPlanChange> {
    const plan = await this.plans.findById(planId);
    if (!plan || plan.userId !== userId) throw AppError.notFound('No such plan.');
    if (await this.users.isBlocked(userId)) {
      throw AppError.forbidden('You are blocked for missed reports. Admin has to unblock you first.');
    }
    if (plan.planDate !== (await this.deadlines.today())) {
      throw AppError.conflict('Only today’s plan can be changed this way. For another day, ask Admin to reopen the plan.');
    }
    const status = (await this.approvals.getForRecord('DAILY_PLAN', plan.id))?.status;
    if (!isPlanApproved(status)) {
      throw AppError.conflict(
        status === 'SUBMITTED'
          ? 'This plan is still waiting for approval. Withdraw it to edit it.'
          : 'This plan isn’t approved, so edit and submit it instead of asking for a change.',
      );
    }

    await this.submitter.validateDays(userId, [{ day: proposed, field: '' }]);
    if (sameDay(plan, proposed)) throw AppError.badRequest('That is the same as the plan you have.');
    const [applied, max] = await Promise.all([this.changes.countApplied(plan.id), this.deadlines.changeMax()]);
    if (applied >= max) {
      throw AppError.conflict(`This plan has already been changed ${applied} time(s), the most allowed. Ask Admin.`, { applied, max });
    }

    const { workingType, workWith, routeIds, remarks } = plan;
    try {
      return await this.transactions.run(async (ctx) => {
        const created = await this.changes.create(
          { planId: plan.id, userId, planDate: plan.planDate, previous: { workingType, workWith, routeIds, remarks }, proposed, reason, basedOnRevision: plan.revision },
          ctx,
        );
        await this.approvals.submit({ kind: DAILY_PLAN_CHANGE_KIND, recordId: created.id, submitterId: userId }, ctx);
        return created;
      });
    } catch (err) {
      if (err instanceof OpenChangeExistsError) {
        throw AppError.conflict('You already have a change waiting for this plan. Withdraw it to ask for another.');
      }
      throw err;
    }
  }
}
