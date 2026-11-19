import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import { readBusinessDay } from '@/shared/config/readConfig.js';
import { lateGrantEnd } from '@/shared/time/lateGrantDuration.js';
import { endOfBusinessDay } from '@/shared/time/businessTime.js';
import type { ConfigProviderPort } from '../domain/configProvider.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { LateSubmitGrantRepositoryPort } from '../domain/lateSubmitGrant.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import type { PlanKind } from '../domain/plan.js';

/**
 * A reopened plan comes with a deadline (decision-log 2026-11-19): when Admin or a manager reopens a Daily or Tour Plan they pick how long the
 * employee has to send it again (30 minutes, 1 hour, 12 hours; 1 hour when none is given, so a phone that doesn't ask yet still gets a limit).
 * The deadline is an ordinary late-submission exception for that plan, used up by the resubmit. A Daily Plan's never runs past its own business day.
 */
export function makeReopenGrantHandler(
  kind: PlanKind,
  daily: DailyPlanRepositoryPort,
  monthly: MonthlyPlanRepositoryPort,
  grants: LateSubmitGrantRepositoryPort,
  config: ConfigProviderPort,
  now: () => Date,
) {
  return async (change: ApprovalStatusChange): Promise<void> => {
    if (change.status !== 'REOPENED' || change.action.action !== 'REOPEN') return;
    const at = now();
    let planKey: string;
    let end = lateGrantEnd(at, change.action.reopenDuration);
    if (kind === 'DAILY_PLAN') {
      const plan = await daily.findById(change.recordId);
      if (!plan) return;
      planKey = plan.planDate;
      const { timeZone, dayStart } = await readBusinessDay(config);
      const dayEnd = endOfBusinessDay(planKey, dayStart, timeZone);
      if (dayEnd <= at) return; // The day is over: nothing to send in time.
      if (dayEnd < end) end = dayEnd;
    } else {
      const plan = await monthly.findById(change.recordId);
      if (!plan) return;
      planKey = plan.planMonth;
    }
    // `null` when an open exception for this plan exists already; that one stands.
    await grants.create(
      { userId: change.request.submitterId, kind, planKey, reason: change.action.comment ?? 'Reopened for changes', grantedBy: change.action.actorId, grantedByRole: change.action.actorRole, grantedAt: at, expiresAt: end },
      at,
    );
  };
}
