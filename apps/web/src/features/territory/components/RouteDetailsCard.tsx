'use client';

import type { RouteDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { paiseToRupees } from '@/lib/money';
import { useUpdateRoute } from '../hooks/useRouteMutations';
import { AREA_TYPE_LABEL } from '../lib/draft';
import { changedRouteFields } from '../lib/routeDraft';
import { StatusToggleDialog } from './StatusToggleDialog';

/** Name, TA rate override and status. The Area is read-only: a route cannot be re-parented. */
export function RouteDetailsCard({
  route,
  areaLabel,
  areaType,
  readOnly,
}: {
  route: RouteDto;
  areaLabel: string;
  areaType: keyof typeof AREA_TYPE_LABEL | undefined;
  readOnly: boolean;
}) {
  const [name, setName] = useState(route.name);
  const [rate, setRate] = useState(route.taPerKmRateOverridePaise === null ? '' : paiseToRupees(route.taPerKmRateOverridePaise));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const update = useUpdateRoute(route.id, () => setToggling(false));

  const built = changedRouteFields(route, { name, rate });
  const unchanged = built.ok && Object.keys(built.body).length === 0;

  function save() {
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    if (!unchanged) update.mutate(built.body);
  }

  return (
    <Card
      title="Details"
      actions={
        <Button variant={route.status === 'active' ? 'secondary' : 'primary'} size="sm" disabled={readOnly} onClick={() => setToggling(true)}>
          {route.status === 'active' ? 'Deactivate' : 'Reactivate'}
        </Button>
      }
    >
      <form
        noValidate
        className="grid gap-5 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <FormField label="Name" htmlFor="route-name" error={errors['name']}>
          <Input id="route-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} aria-invalid={errors['name'] ? true : undefined} />
        </FormField>
        <FormField label="TA rate override (₹ per km)" htmlFor="route-rate" error={errors['rate']} hint="Leave empty to use the employee's pay band rate.">
          <Input id="route-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} disabled={readOnly} aria-invalid={errors['rate'] ? true : undefined} />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-text">Area</p>
          <p className="flex items-center gap-2 text-sm text-text-muted">
            {areaLabel}
            {areaType ? <Badge tone="accent">{AREA_TYPE_LABEL[areaType]}</Badge> : null}
          </p>
          <p className="text-[13px] text-text-subtle">A route cannot move to another area. The area&rsquo;s type sets the DA rate.</p>
        </div>
        <div className="flex items-end justify-end">
          <Button type="submit" disabled={readOnly || unchanged || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save details'}
          </Button>
        </div>
      </form>
      <StatusToggleDialog
        item={toggling ? { id: route.id, name: route.name, status: route.status } : null}
        noun="route"
        pending={update.isPending}
        onClose={() => setToggling(false)}
        onConfirm={(status) => update.mutate({ status })}
      />
    </Card>
  );
}
