import type { PlanningSnapshot } from '@greynote/contracts';
import type { SyncSourceDefinition } from '@/modules/sync/sync.public.js';
import { addDays } from '@/shared/time/businessTime.js';
import type { PlanDeadlines } from './planDeadlines.js';
import type { ListDailyPlansUseCase } from './usecases/listDailyPlans.usecase.js';
import type { ListMonthlyPlansUseCase } from './usecases/listMonthlyPlans.usecase.js';

export const PLANNING_SYNC_SOURCE = 'planning';

/** How far back and ahead the phone keeps Daily Plans, in days. */
const DAYS_BACK = 7;
const DAYS_AHEAD = 30;

const nextMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/**
 * What the MR's phone caches of Planning (LLD sync.md, Pull): their own Daily Plans from a week back to a
 * month ahead and this month's and next month's Monthly Plans, each with its approval status — the phone
 * needs the status to gate the day's calls client-side (a UX gate; the server's check is the real one). Saving
 * and submitting a Plan need a connection and aren't synced. Left out: revision counters' internals, the
 * resubmit counter and timestamps that only churn.
 */
export function makePlanningSource(deps: { deadlines: PlanDeadlines; daily: ListDailyPlansUseCase; monthly: ListMonthlyPlansUseCase }): SyncSourceDefinition {
  return {
    name: PLANNING_SYNC_SOURCE,
    async snapshot(userId): Promise<PlanningSnapshot> {
      const today = await deps.deadlines.today();
      const month = today.slice(0, 7);
      const [daily, monthly] = await Promise.all([
        deps.daily.execute(userId, addDays(today, -DAYS_BACK), addDays(today, DAYS_AHEAD)),
        deps.monthly.execute(userId, month, nextMonth(month)),
      ]);
      return {
        today,
        dailyPlans: daily.map((p) => ({
          id: p.id,
          planDate: p.planDate,
          workingType: p.workingType,
          workWith: p.workWith,
          routeIds: p.routeIds,
          doctors: p.doctors,
          remarks: p.remarks,
          revision: p.revision,
          status: p.status,
          approvalRequestId: p.approval?.requestId ?? null,
          submitDeadline: p.submitDeadline.toISOString(),
        })),
        monthlyPlans: monthly.map((p) => ({
          id: p.id,
          planMonth: p.planMonth,
          entries: p.entries,
          revision: p.revision,
          status: p.status,
          approvalRequestId: p.approval?.requestId ?? null,
          submitDeadline: p.submitDeadline.toISOString(),
        })),
      };
    },
  };
}
