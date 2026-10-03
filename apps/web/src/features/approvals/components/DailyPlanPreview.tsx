'use client';

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
          <PlanDayView day={plan} />
        </div>
      ) : null}
    </PreviewFrame>
  );
}
