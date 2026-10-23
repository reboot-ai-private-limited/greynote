import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { assertEditable } from '../assertEditable.js';
import { MonthlyPlanWriter } from '../monthlyPlanWriter.js';
import { OffDays } from '../offDays.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

/**
 * Create or replace the caller's plan for a month — every entry at once, `DRAFT` until submitted. No entry, and no day of a trip,
 * may fall on one of the employee's off days (weekly off, a holiday of their main HQ: decision-log 2026-10-22).
 */
export class SaveMonthlyPlanUseCase {
  private readonly writer: MonthlyPlanWriter;

  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly views: PlanViews,
    offDays: OffDays = new OffDays(),
  ) {
    this.writer = new MonthlyPlanWriter(plans, approvals, offDays);
  }

  async execute(userId: string, planMonth: string, entries: MonthlyPlanEntry[]): Promise<MonthlyPlanView> {
    const existing = await this.plans.findByUserAndMonth(userId, planMonth);
    const prepared = await this.writer.prepare(userId, planMonth, entries, async () => {
      if (existing) await assertEditable(this.approvals, 'MONTHLY_PLAN', existing.id);
    });

    const saved = await this.plans.save(userId, planMonth, prepared.entries, existing?.revision ?? null);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    await this.writer.saveNext(userId, prepared);
    return this.views.monthly(saved);
  }
}
