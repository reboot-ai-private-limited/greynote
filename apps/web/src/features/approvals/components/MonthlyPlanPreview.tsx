'use client';

import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/format';
import { useMonthlyPlan } from '../hooks/usePreviews';
import { monthRows, monthSummary, offDayLabel, planDayLabel } from '../lib/plans';
import { PlanDayView } from './PlanDayView';
import { PreviewFrame } from './PreviewFrame';

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * A whole month's plan, one row per planned day, with the employee's weekly offs and holidays shown as locked days between them.
 * A day planned on one (saved before HR added the holiday) is flagged: the plan can't be submitted again until it is taken out.
 */
export function MonthlyPlanPreview({ recordId }: { recordId: string }) {
  const query = useMonthlyPlan(recordId);
  const plan = query.data;
  return (
    <PreviewFrame title="Monthly plan" description="Every day the employee has planned for the month, with their weekly offs and holidays." query={query}>
      {plan ? (
        <div className="space-y-4 p-5">
          <div>
            <p className="text-sm font-medium text-text">{monthLabel(plan.planMonth)}</p>
            <p className="text-sm text-text-muted">{monthSummary(plan.entries)}</p>
          </div>
          {plan.entries.length > 0 || plan.offDays.length > 0 ? (
            <ol className="divide-y divide-border rounded-md border border-border">
              {monthRows(plan.entries, plan.offDays).map(({ date, entry, off }) => (
                <li key={date} className={`grid gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr] ${entry ? '' : 'bg-surface-hover/60'}`}>
                  <p className="text-sm font-medium tabular-nums text-text">{planDayLabel(date)}</p>
                  <div className="space-y-1.5">
                    {off ? <Badge tone={entry ? 'warning' : 'neutral'}>{entry ? `Planned on a locked day: ${offDayLabel(off)}` : offDayLabel(off)}</Badge> : null}
                    {entry ? <PlanDayView day={entry} /> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {plan.amendments.length > 0 ? (
            <div className="space-y-1 rounded-md border border-border bg-surface-hover/60 p-3 text-sm">
              <p className="font-medium text-text">Changed while waiting</p>
              {plan.amendments.map((a) => (
                <p key={a.at} className="text-text-muted">
                  {formatDateTime(a.at)}{a.reason ? ` · ${a.reason}` : ''} <span className="text-text-subtle">({a.previous.length} planned {a.previous.length === 1 ? 'day' : 'days'} replaced)</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </PreviewFrame>
  );
}
