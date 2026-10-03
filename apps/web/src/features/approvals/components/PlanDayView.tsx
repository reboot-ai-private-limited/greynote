'use client';

import type { PlanDayDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { WORKING_TYPE_LABEL } from '../lib/review';

/** One planned day: what it is for, the routes, who they work with, and any remarks. */
export function PlanDayView({ day }: { day: PlanDayDto }) {
  const directory = useTerritoryDirectory();
  return (
    <div className="space-y-2 text-sm">
      <Badge tone={day.workingType === 'FIELD_WORK' ? 'accent' : 'neutral'}>{WORKING_TYPE_LABEL[day.workingType]}</Badge>
      {day.routeIds.length > 0 ? (
        <p>
          <span className="text-text-subtle">Routes: </span>
          {day.routeIds.map((id) => directory.routeLabel(id)).join('; ')}
        </p>
      ) : null}
      {day.workWith.length > 0 ? (
        <p>
          <span className="text-text-subtle">Works with: </span>
          {day.workWith.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : ''}
              <EmployeeName userId={id} />
            </span>
          ))}
        </p>
      ) : null}
      {day.remarks ? <p className="rounded-md bg-surface-subtle px-3 py-2 text-text-muted">“{day.remarks}”</p> : null}
    </div>
  );
}
