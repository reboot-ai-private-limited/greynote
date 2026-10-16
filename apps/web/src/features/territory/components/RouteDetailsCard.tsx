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
import { useStationThresholds } from '../hooks/useStationThresholds';
import { AUTO_ROUTE_TYPE, ROUTE_TYPE_LABEL, autoTypeLabel } from '../lib/draft';
import { changedRouteFields, suggestedType } from '../lib/routeDraft';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useRouter } from 'next/navigation';
import { DeleteTerritoryDialog } from './DeleteTerritoryDialog';

/** Destination, km, type, TA rate override and status. The HQ is read-only: a route cannot be re-parented. */
export function RouteDetailsCard({
  route,
  hqLabel,
  readOnly,
}: {
  route: RouteDto;
  hqLabel: string;
  readOnly: boolean;
}) {
  const thresholds = useStationThresholds();
  const [destinationName, setDestinationName] = useState(route.destinationName);
  const [distanceKm, setDistanceKm] = useState(route.distanceKm ?? '');
  const [type, setType] = useState<string>(
    route.typeSource === 'AUTO' ? AUTO_ROUTE_TYPE : route.type,
  );
  const [rate, setRate] = useState(
    route.taPerKmRateOverridePaise === null ? '' : paiseToRupees(route.taPerKmRateOverridePaise),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const update = useUpdateRoute(route.id, () => setToggling(false));

  const built = changedRouteFields(route, {
    destinationName,
    distanceKm,
    type: type as RouteType | typeof AUTO_ROUTE_TYPE,
    rate,
  });
  const typeOptions = [
    { value: AUTO_ROUTE_TYPE, label: autoTypeLabel(suggestedType(distanceKm, thresholds)) },
    ...ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] })),
  ];
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
        <div className="flex gap-2">
          <Button
            variant={route.status === 'active' ? 'secondary' : 'primary'}
            size="sm"
            disabled={readOnly}
            onClick={() => setToggling(true)}
          >
            {route.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </Button>
          <Button variant="danger" size="sm" disabled={readOnly} onClick={() => setDeleting(true)}>
            Delete…
          </Button>
        </div>
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
        <FormField
          label="Destination"
          htmlFor="route-destination"
          error={errors['destinationName']}
          hint="The route is named “HQ to destination”, so changing this renames it."
        >
          <Input
            id="route-destination"
            value={destinationName}
            onChange={(e) => setDestinationName(e.target.value)}
            disabled={readOnly}
            aria-invalid={errors['destinationName'] ? true : undefined}
          />
        </FormField>
        <FormField
          label="Distance (km)"
          htmlFor="route-km"
          error={errors['distanceKm']}
          hint={
            route.distanceKm === null
              ? 'No distance yet — TA for a day on this route is flagged until you enter it.'
              : 'One way, by road. TA is paid on exactly this number.'
          }
        >
          <Input
            id="route-km"
            inputMode="decimal"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            disabled={readOnly}
            aria-invalid={errors['distanceKm'] ? true : undefined}
          />
        </FormField>
        <FormField
          label="TA rate override (₹ per km)"
          htmlFor="route-rate"
          error={errors['rate']}
          hint="Leave empty to use the employee's pay band rate."
        >
          <Input
            id="route-rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={readOnly}
            aria-invalid={errors['rate'] ? true : undefined}
          />
        </FormField>
        <FormField
          label="Type"
          htmlFor="route-type"
          hint="Sets which DA rate a day on this route earns. Automatic follows the km. A change affects DA from now on, not days already approved."
        >
          <Select
            id="route-type"
            value={type}
            onValueChange={setType}
            options={typeOptions}
            disabled={readOnly}
          />
          {route.typeWarning ? (
            <p role="status" className="text-[13px] text-warning-fg">
              {route.typeWarning}
            </p>
          ) : null}
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
      <DeleteTerritoryDialog
        segment="routes"
        item={deleting ? { id: route.id, name: route.name } : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => router.push('/routes')}
      />
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
