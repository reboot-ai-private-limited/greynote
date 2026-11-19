'use client';

import { formatDateTime } from '@/lib/format';
import { useMonthlyPlan } from '../hooks/usePreviews';
import { planDayLabel } from '../lib/plans';
import { PlanDayView } from './PlanDayView';
import { PreviewFrame } from './PreviewFrame';

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

const shape = (e: { workingType: string; routeIds: string[]; remarks: string | null; dayKind: string; returnDate?: string | null } | undefined): string =>
  e ? [e.workingType, [...e.routeIds].sort().join(), e.remarks ?? '', e.dayKind, e.returnDate ?? ''].join('|') : '';

/**
 * A manager's change to an approved month (decision-log 2026-11-19): each day that would change, the way it is now and the way it would become.
 * The request's record id is `<plan id>:<change id>`. Approving applies it, after the server checks again that no day is over or already sent.
 */
export function MonthlyPlanChangePreview({ recordId }: { recordId: string }) {
  const planId = recordId.split(':')[0] ?? recordId;
  const query = useMonthlyPlan(planId);
  const plan = query.data;
  const pending = plan?.pendingChange && `${planId}:${plan.pendingChange.id}` === recordId ? plan.pendingChange : null;
  const now = new Map((plan?.entries ?? []).map((e) => [e.planDate, e]));
  const next = new Map((pending?.entries ?? []).map((e) => [e.planDate, e]));
  const dates = [...new Set([...now.keys(), ...next.keys()])].filter((d) => shape(now.get(d)) !== shape(next.get(d))).sort();
  return (
    <PreviewFrame title="Tour plan change" description="A manager’s change to an approved month. Nothing changes until it is approved." query={query}>
      {plan ? (
        <div className="space-y-4 p-5">
          <p className="text-sm font-medium text-text">{monthLabel(plan.planMonth)}</p>
          {pending ? (
            <>
              <p className="text-sm text-text-muted">
                Sent {formatDateTime(pending.at)}
                {pending.reason ? ` · ${pending.reason}` : ''}
              </p>
              <ol className="divide-y divide-border rounded-md border border-border">
                {dates.map((date) => (
                  <li key={date} className="grid gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr_1fr]">
                    <p className="text-sm font-medium tabular-nums text-text">{planDayLabel(date)}</p>
                    <div>
                      <p className="mb-1 text-xs text-text-subtle">Now</p>
                      {now.get(date) ? <PlanDayView day={now.get(date)!} /> : <p className="text-sm text-text-muted">Not planned</p>}
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-text-subtle">Would become</p>
                      {next.get(date) ? <PlanDayView day={next.get(date)!} /> : <p className="text-sm text-text-muted">Not planned</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-sm text-text-muted">This change is no longer waiting. It was decided or withdrawn.</p>
          )}
        </div>
      ) : null}
    </PreviewFrame>
  );
}
