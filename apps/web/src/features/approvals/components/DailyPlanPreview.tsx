'use client';

import { Badge } from '@/components/ui/Badge';
import { Field, FieldList } from '@/components/ui/FieldList';
import { formatDateTime } from '@/lib/format';
import { useDailyPlan } from '../hooks/usePreviews';
import { planDayLabel } from '../lib/plans';
import { PlanDayView } from './PlanDayView';
import { PreviewFrame } from './PreviewFrame';

/** One day's plan: where the MR means to be, and with whom. */
export function DailyPlanPreview({ recordId }: { recordId: string }) {
  const query = useDailyPlan(recordId);
  const plan = query.data;
  return (
    <PreviewFrame title="Daily plan" description="What the employee plans to do that day." query={query}>
      {plan ? (
        <div className="space-y-5 p-5">
          <FieldList>
            <Field label="Day">{planDayLabel(plan.planDate)}</Field>
            <Field label="Submit deadline">{formatDateTime(plan.submitDeadline)}</Field>
          </FieldList>
          {plan.changedFromMonthly ? <Badge tone="warning">Changed from the monthly plan</Badge> : null}
          <PlanDayView day={plan} />
          {plan.plannedFrom ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-text-muted">The monthly plan said</p>
              <PlanDayView day={plan.plannedFrom} />
            </div>
          ) : null}
        </div>
      ) : null}
    </PreviewFrame>
  );
}
