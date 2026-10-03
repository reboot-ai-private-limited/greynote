'use client';

import type { RouteDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useRecalculate } from '../hooks/useRouteMutations';
import { distanceSummary } from '../lib/routeDraft';
import { ManualDistanceDialog } from './ManualDistanceDialog';

/**
 * The route's distance and what can be done about it. A failed calculation is shown as failed — never
 * as 0 km — with retry and manual entry. `dirty` means the destination has an unsaved edit, so a
 * recalculation would measure the OLD destination and is disabled until it is saved.
 */
export function DistanceCard({ route, readOnly, dirty }: { route: RouteDto; readOnly: boolean; dirty: boolean }) {
  const [manual, setManual] = useState(false);
  const recalc = useRecalculate(route.id);
  const summary = distanceSummary(route);
  const failed = summary.label === 'Failed';

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-text-muted">Distance</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-text">{summary.km}</p>
        </div>
        <Badge tone={summary.tone}>{summary.label}</Badge>
      </div>

      {failed ? (
        <p role="alert" className="mt-3 rounded-md bg-danger-bg p-3 text-[13px] text-danger-fg">
          The distance could not be calculated, so TA for this route is flagged rather than treated as 0 km. Retry the
          calculation, or enter the distance manually.
        </p>
      ) : null}
      {route.distanceSource === 'MANUAL_OVERRIDE' && !failed ? (
        <p className="mt-3 text-[13px] text-text-subtle">
          Entered manually. Changing the destination or recalculating will replace it. Changing the HQ’s base place leaves it alone.
        </p>
      ) : null}
      <p className="mt-3 text-[13px] text-text-subtle">
        This is the paid one-way figure used for TA — it is not doubled for a return trip. Enter the full paid travel by hand if
        the road distance is not what should be paid.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={readOnly || dirty || recalc.isPending}
          title={dirty ? 'Save the destination first' : undefined}
          onClick={() => recalc.mutate()}
        >
          {recalc.isPending ? 'Calculating…' : failed ? 'Retry calculation' : 'Recalculate'}
        </Button>
        <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setManual(true)}>
          Enter manually
        </Button>
      </div>
      {manual ? <ManualDistanceDialog routeId={route.id} onClose={() => setManual(false)} /> : null}
    </div>
  );
}
