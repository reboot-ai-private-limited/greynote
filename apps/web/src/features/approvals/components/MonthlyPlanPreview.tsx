'use client';

import { useMonthlyPlan } from '../hooks/usePreviews';
import { monthSummary, planDayLabel, sortedEntries } from '../lib/plans';
import { PlanDayView } from './PlanDayView';
import { PreviewFrame } from './PreviewFrame';

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

/** A whole month's plan, one row per planned day. */
export function MonthlyPlanPreview({ recordId }: { recordId: string }) {
  const query = useMonthlyPlan(recordId);
  const plan = query.data;
  return (
    <PreviewFrame title="Monthly plan" description="Every day the employee has planned for the month." query={query}>
      {plan ? (
        <div className="space-y-4 p-5">
          <div>
            <p className="text-sm font-medium text-text">{monthLabel(plan.planMonth)}</p>
            <p className="text-sm text-text-muted">{monthSummary(plan.entries)}</p>
          </div>
          {plan.entries.length > 0 ? (
            <ol className="divide-y divide-border rounded-md border border-border">
              {sortedEntries(plan.entries).map((entry) => (
                <li key={entry.planDate} className="grid gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr]">
                  <p className="text-sm font-medium tabular-nums text-text">{planDayLabel(entry.planDate)}</p>
                  <PlanDayView day={entry} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </PreviewFrame>
  );
}
