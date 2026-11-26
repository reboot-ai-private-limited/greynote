'use client';

import type { RouteDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { paiseToRupees } from '@/lib/money';
import { usePlaceDirectory } from '../hooks/usePlaces';
import { useUpdateRoute } from '../hooks/useRouteMutations';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { changedPlaceRouteFields, taModeOf, type TaMode } from '../lib/routeDraft';
import { DeleteTerritoryDialog } from './DeleteTerritoryDialog';
import { RoutePayPreview } from './RoutePayPreview';
import { TaChoiceFields } from './TaChoiceFields';

/**
 * A route between two places (decision-log 2026-11-26): km, TA and status are edited here; the name and type come from
 * the places (edit the place to change them), and the ends can't change (make another route instead).
 */
export function PlaceRouteDetailsCard({ route, readOnly }: { route: RouteDto; readOnly: boolean }) {
  const places = usePlaceDirectory();
  const [distanceKm, setDistanceKm] = useState(route.distanceKm ?? '');
  const [taMode, setTaMode] = useState<TaMode>(taModeOf(route));
  const [rate, setRate] = useState(route.taPerKmRateOverridePaise == null ? '' : paiseToRupees(route.taPerKmRateOverridePaise));
  const [fixed, setFixed] = useState(route.taFixedPaise == null ? '' : paiseToRupees(route.taFixedPaise));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const update = useUpdateRoute(route.id, () => setToggling(false));

  const built = changedPlaceRouteFields(route, { distanceKm, taMode, rate, fixed });
  const unchanged = built.ok && Object.keys(built.body).length === 0;
  function save() {
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    if (!unchanged) update.mutate(built.body);
  }

  const end = (label: string, id: string | null | undefined) => (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-text">{label}</p>
      <p className="text-sm text-text-muted">
        {id ? (
          <Link href={`/places?search=${encodeURIComponent(places.byId.get(id)?.name ?? '')}`} className="hover:text-accent hover:underline">
            {places.labelOf(id)}
          </Link>
        ) : (
          '—'
        )}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card
        title="Details"
        description="A route works both ways. Its name and type come from its places: edit the place to change them."
        actions={
          <div className="flex gap-2">
            <Button variant={route.status === 'active' ? 'secondary' : 'primary'} size="sm" disabled={readOnly} onClick={() => setToggling(true)}>
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
          {end('From', route.fromPlaceId)}
          {end('To', route.toPlaceId)}
          <FormField
            label="Distance (km)"
            htmlFor="route-km"
            error={errors['distanceKm']}
            hint={route.distanceKm === null ? 'No distance yet — TA for a day on this route is flagged until you enter it.' : 'One way, by road.'}
          >
            <Input id="route-km" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} disabled={readOnly} aria-invalid={errors['distanceKm'] ? true : undefined} />
          </FormField>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-text">Type</p>
            <p className="text-sm text-text-muted">{ROUTE_TYPE_LABEL[route.type]}</p>
          </div>
          <TaChoiceFields
            idPrefix="route"
            taMode={taMode}
            onTaModeChange={setTaMode}
            rate={rate}
            onRateChange={setRate}
            fixed={fixed}
            onFixedChange={setFixed}
            errors={errors}
            disabled={readOnly}
          />
          <div className="flex items-end justify-end sm:col-span-2">
            <Button type="submit" disabled={readOnly || unchanged || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </form>
        <DeleteTerritoryDialog segment="routes" item={deleting ? { id: route.id, name: route.name } : null} onClose={() => setDeleting(false)} onDeleted={() => router.push('/routes')} />
        <StatusToggleDialog
          item={toggling ? { id: route.id, name: route.name, status: route.status } : null}
          noun="route"
          pending={update.isPending}
          onClose={() => setToggling(false)}
          onConfirm={(status) => update.mutate({ status })}
        />
      </Card>
      <RoutePayPreview distanceKm={distanceKm} type={route.type} rate={taMode === 'RATE' ? rate : ''} fixed={taMode === 'FIXED' ? fixed : ''} />
    </div>
  );
}
