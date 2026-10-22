import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { PlanDeadlines } from './planDeadlines.js';

/**
 * Daily Plans and a doctor leaving the field (decision-log 2026-10-22): when an MR loses a doctor (unassigned, replaced) or the
 * doctor is deactivated or deleted, Field Master Data asks Planning — through the composition root — to take it off the plans from
 * today on that the employee can still change. A submitted or approved plan keeps it: it is the record of what was approved, and a
 * call on the doctor is refused anyway. Without this, the plan's own submit would refuse it ("isn't one of your doctors").
 */
export class DoctorReleases {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly deadlines: PlanDeadlines,
  ) {}

  private async editable(plan: DailyPlan): Promise<boolean> {
    const request = await this.approvals.getForRecord('DAILY_PLAN', plan.id);
    return !request || isEditableBySubmitter(request.status);
  }

  /** Plans from today on that list the doctor: the ones still editable, and the ones submitted or approved. */
  async count(doctorId: string): Promise<{ editable: number; locked: number }> {
    const plans = await this.plans.listWithDoctor(doctorId, await this.deadlines.today(), null);
    let editable = 0;
    for (const plan of plans) if (await this.editable(plan)) editable++;
    return { editable, locked: plans.length - editable };
  }

  /** Takes the doctor off the editable plans from today on — this employee's, or everyone's (`null`). Returns how many changed. */
  async release(doctorId: string, userId: string | null): Promise<number> {
    let changed = 0;
    for (const plan of await this.plans.listWithDoctor(doctorId, await this.deadlines.today(), userId)) {
      if (await this.drop(plan, doctorId)) changed++;
    }
    return changed;
  }

  /** One retry if the plan moved on meanwhile (the employee saved it); after that the plan's own submit still refuses the doctor. */
  private async drop(plan: DailyPlan, doctorId: string, retried = false): Promise<boolean> {
    if (!(await this.editable(plan))) return false;
    const saved = await this.plans.saveDoctors(plan.id, plan.revision, plan.doctors.filter((d) => d.doctorId !== doctorId));
    if (saved) return true;
    const fresh = retried ? null : await this.plans.findById(plan.id);
    return fresh && fresh.doctors.some((d) => d.doctorId === doctorId) ? this.drop(fresh, doctorId, true) : false;
  }
}
