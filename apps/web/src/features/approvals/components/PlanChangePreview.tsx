'use client';

import type { DailyPlanChangeDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { Field, FieldList } from '@/components/ui/FieldList';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useDailyPlan, usePlanChange } from '../hooks/usePreviews';
import { changeStateLabel, changedFields, isStaleChange, listDiff, planDayLabel } from '../lib/plans';
import { WORKING_TYPE_LABEL } from '../lib/review';
import { PlanDayView } from './PlanDayView';
import { PreviewFrame } from './PreviewFrame';

/** An in-day change to an approved plan: the plan as it was beside what is proposed, and exactly what differs. */
export function PlanChangePreview({ recordId }: { recordId: string }) {
  const query = usePlanChange(recordId);
  const change = query.data;
  // The plan's current revision, to tell the reviewer the change is already out of date.
  const plan = useDailyPlan(change?.planId ?? '', Boolean(change));
  const stale = change ? isStaleChange(change, plan.data?.revision) : false;

  return (
    <PreviewFrame title="Plan change" description="The employee asks to change a plan that was already approved." query={query}>
      {change ? (
        <div className="space-y-5 p-5">
          <FieldList>
            <Field label="Day">{planDayLabel(change.planDate)}</Field>
            <Field label="Status">
              <Badge tone={change.open ? 'warning' : change.applied ? 'success' : 'neutral'}>{changeStateLabel(change)}</Badge>
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Reason">{change.reason}</Field>
            </div>
          </FieldList>

          {stale ? (
            <p role="alert" className="rounded-md border border-danger bg-danger-bg p-3 text-sm text-danger-fg">
              The plan has been changed since this was asked for, so approving it will fail. The employee needs to ask again.
            </p>
          ) : null}

          <ChangeSummary change={change} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">As approved</p>
              <PlanDayView day={change.previous} />
            </div>
            <div className="rounded-md border border-accent p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">Proposed</p>
              <PlanDayView day={change.proposed} />
            </div>
          </div>
        </div>
      ) : null}
    </PreviewFrame>
  );
}

/** One line per part that changes, so the difference is read, not hunted for across two cards. */
function ChangeSummary({ change }: { change: DailyPlanChangeDto }) {
  const directory = useTerritoryDirectory();
  const fields = changedFields(change.previous, change.proposed);
  if (fields.length === 0) return <p className="text-sm text-text-muted">The proposed day is the same as the approved one.</p>;

  const routes = listDiff(change.previous.routeIds, change.proposed.routeIds);
  const people = listDiff(change.previous.workWith, change.proposed.workWith);

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">What changes</p>
      <ul className="space-y-1.5 text-sm">
        {fields.map(({ field, label }) => (
          <li key={field}>
            <span className="font-medium text-text">{label}: </span>
            {field === 'workingType' ? (
              <span>
                {WORKING_TYPE_LABEL[change.previous.workingType]} → {WORKING_TYPE_LABEL[change.proposed.workingType]}
              </span>
            ) : field === 'routes' ? (
              <span>
                {routes.added.map((id) => (
                  <span key={`+${id}`} className="mr-2 text-success-fg">
                    + {directory.routeLabel(id)}
                  </span>
                ))}
                {routes.removed.map((id) => (
                  <span key={`-${id}`} className="mr-2 text-danger-fg">
                    − {directory.routeLabel(id)}
                  </span>
                ))}
              </span>
            ) : field === 'workWith' ? (
              <span>
                {people.added.map((id) => (
                  <span key={`+${id}`} className="mr-2 text-success-fg">
                    + <EmployeeName userId={id} />
                  </span>
                ))}
                {people.removed.map((id) => (
                  <span key={`-${id}`} className="mr-2 text-danger-fg">
                    − <EmployeeName userId={id} />
                  </span>
                ))}
              </span>
            ) : (
              <span>
                {change.previous.remarks ? `“${change.previous.remarks}”` : 'none'} → {change.proposed.remarks ? `“${change.proposed.remarks}”` : 'none'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
