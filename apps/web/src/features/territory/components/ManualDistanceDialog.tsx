'use client';

import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useSetDistance } from '../hooks/useRouteMutations';
import { buildDistanceOverride } from '../lib/routeDraft';
import { FormDialog } from '@/components/ui/FormDialog';

/** Enter the distance by hand — free (no Google call) and rescues a failed calculation. */
export function ManualDistanceDialog({ routeId, onClose }: { routeId: string; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const set = useSetDistance(routeId, onClose);

  function submit() {
    const built = buildDistanceOverride(value);
    if (!built.ok) return setError(built.error);
    set.mutate(built.distanceKm);
  }

  return (
    <FormDialog
      title="Enter distance manually"
      description="This replaces the calculated figure. Editing the stops or recalculating later will overwrite it."
      formId="distance-form"
      pending={set.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Distance (km)" htmlFor="distance-km" error={error} hint="The paid figure used for TA — it is not doubled for a return trip.">
        <Input id="distance-km" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
