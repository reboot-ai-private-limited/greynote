'use client';

import { ROUTE_TYPES, type RouteDto, type RouteType } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { paiseToRupees } from '@/lib/money';
import { useUpdateRoute } from '../hooks/useRouteMutations';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { changedRouteFields } from '../lib/routeDraft';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';

const TYPE_OPTIONS = ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }));

/** Name, type, TA rate override and status. The HQ is read-only: a route cannot be re-parented. */
export function RouteDetailsCard({
  route,
  hqLabel,
  readOnly,
}: {
  route: RouteDto;
  hqLabel: string;
  readOnly: boolean;
}) {
  const [name, setName] = useState(route.name);
  const [type, setType] = useState<RouteType>(route.type);
  const [rate, setRate] = useState(route.taPerKmRateOverridePaise === null ? '' : paiseToRupees(route.taPerKmRateOverridePaise));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const update = useUpdateRoute(route.id, () => setToggling(false));

  const built = changedRouteFields(route, { name, type, rate });
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
        <FormField label="Type" htmlFor="route-type" hint="Sets which DA rate a day on this route earns. A change affects DA from now on, not days already approved.">
          <Select id="route-type" value={type} onValueChange={(v) => setType(v as RouteType)} options={TYPE_OPTIONS} disabled={readOnly} />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-text">HQ</p>
          <p className="text-sm text-text-muted">{hqLabel}</p>
          <p className="text-[13px] text-text-subtle">A route cannot move to another HQ.</p>
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
