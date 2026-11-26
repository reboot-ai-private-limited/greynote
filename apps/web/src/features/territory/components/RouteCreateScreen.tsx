'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { usePlaceDirectory } from '../hooks/usePlaces';
import { useCreateRoute } from '../hooks/useRouteMutations';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { buildPlaceRoute, routeTypeBetween, type TaMode } from '../lib/routeDraft';
import { RoutePayPreview } from './RoutePayPreview';
import { TaChoiceFields } from './TaChoiceFields';

/**
 * From place → To place → km (one way) → TA → save (decision-log 2026-11-26). One route serves both directions; its
 * name and type come from the two places. `?from=<placeId>` starts with From chosen.
 */
export function RouteCreateScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const readOnly = useIsReadOnly();
  const places = usePlaceDirectory();
  const [fromPlaceId, setFrom] = useState(params.get('from') ?? '');
  const [toPlaceId, setTo] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [taMode, setTaMode] = useState<TaMode>('GRADE');
  const [rate, setRate] = useState('');
  const [fixed, setFixed] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateRoute((route) => router.push(`/routes/${route.id}`));

  const from = places.byId.get(fromPlaceId);
  const to = places.byId.get(toPlaceId);
  const type = from && to ? routeTypeBetween(from, to) : null;
  const name = from && to ? `${places.labelOf(from.id)} to ${places.labelOf(to.id)}` : null;

  function submit() {
    const built = buildPlaceRoute({ fromPlaceId, toPlaceId, distanceKm, taMode, rate, fixed });
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/routes" className="text-text-muted hover:text-accent hover:underline">
          ← Routes
        </Link>
      </p>
      <PageHeader
        title="New route"
        description="Choose the two places and enter the one-way distance. A route works both ways."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/routes')}>
              Cancel
            </Button>
            <Button type="submit" form="route-form" disabled={readOnly || create.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
              {create.isPending ? 'Saving…' : 'Save route'}
            </Button>
          </div>
        }
      />
      <form
        id="route-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card
          title="Details"
          description={
            name
              ? `“${name}”, ${type ? ROUTE_TYPE_LABEL[type] : ''}${from && to && from.hqId !== to.hqId ? ' (the places are in different HQs)' : ''}.`
              : 'Missing a place? Add it under Places first.'
          }
        >
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <FormField label="From" htmlFor="new-from" error={errors['fromPlaceId']}>
              <SearchableSelect
                id="new-from"
                value={fromPlaceId}
                onValueChange={setFrom}
                options={places.options}
                placeholder={places.isLoading ? 'Loading places…' : 'Choose a place'}
                searchPlaceholder="Search places"
                aria-invalid={errors['fromPlaceId'] ? true : undefined}
              />
            </FormField>
            <FormField label="To" htmlFor="new-to" error={errors['toPlaceId']}>
              <SearchableSelect
                id="new-to"
                value={toPlaceId}
                onValueChange={setTo}
                options={places.options.filter((o) => o.value !== fromPlaceId)}
                placeholder={places.isLoading ? 'Loading places…' : 'Choose a place'}
                searchPlaceholder="Search places"
                aria-invalid={errors['toPlaceId'] ? true : undefined}
              />
            </FormField>
            <FormField label="Distance (km)" htmlFor="new-km" error={errors['distanceKm']} hint="One way, by road.">
              <Input id="new-km" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} aria-invalid={errors['distanceKm'] ? true : undefined} />
            </FormField>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-text">Type</p>
              <p className="text-sm text-text-muted">{type ? ROUTE_TYPE_LABEL[type] : '—'}</p>
              <p className="text-[13px] text-text-subtle">From the places: the farther one&apos;s type, or Out-station when they are in different HQs.</p>
            </div>
            <TaChoiceFields
              idPrefix="new"
              taMode={taMode}
              onTaModeChange={setTaMode}
              rate={rate}
              onRateChange={setRate}
              fixed={fixed}
              onFixedChange={setFixed}
              errors={errors}
            />
          </div>
        </Card>

        <RoutePayPreview distanceKm={distanceKm} type={type ?? 'HQ'} rate={taMode === 'RATE' ? rate : ''} fixed={taMode === 'FIXED' ? fixed : ''} />
      </form>
    </>
  );
}
