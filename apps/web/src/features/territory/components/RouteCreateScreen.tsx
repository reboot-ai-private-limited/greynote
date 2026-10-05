'use client';

import { ROUTE_TYPES, type PlaceDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useHqs } from '../hooks/useHqs';
import { useCreateRoute } from '../hooks/useRouteMutations';
import { AUTO_ROUTE_TYPE, AUTO_ROUTE_TYPE_LABEL, ROUTE_TYPE_LABEL } from '../lib/draft';
import { buildRoute } from '../lib/routeDraft';
import { PlacePicker } from './PlacePicker';

const TYPE_OPTIONS = [{ value: AUTO_ROUTE_TYPE, label: AUTO_ROUTE_TYPE_LABEL }, ...ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }))];

export function RouteCreateScreen() {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  // One page of 100 (the API's cap), as for the other pickers.
  const hqs = useHqs({ page: 1, pageSize: 100, status: 'active' });
  const [hqId, setHqId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(AUTO_ROUTE_TYPE);
  const [rate, setRate] = useState('');
  const [destination, setDestination] = useState<PlaceDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateRoute((route) => router.push(`/routes/${route.id}`));

  // Only an HQ with a base place can have a route: that is where the distance is measured from.
  const { options, withoutBase } = useMemo(() => {
    const items = hqs.data?.items ?? [];
    return {
      options: items.filter((h) => h.basePlace).map((h) => ({ value: h.id, label: h.name })),
      withoutBase: items.filter((h) => !h.basePlace).length,
    };
  }, [hqs.data]);
  const hq = hqs.data?.items.find((h) => h.id === hqId);

  function submit() {
    const built = buildRoute({ hqId, name, type, rate, destination });
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
      <PageHeader title="New route" description="Choose the HQ it starts from, name the route, and pick where it goes." />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card title="Details">
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <FormField
              label="HQ"
              htmlFor="new-hq"
              error={errors['hqId']}
              hint={withoutBase > 0 ? `${withoutBase} HQ${withoutBase === 1 ? '' : 's'} without a base place ${withoutBase === 1 ? 'is' : 'are'} not listed. Set the base place on the HQs page first.` : 'The route starts from this HQ’s base place.'}
            >
              <Select
                id="new-hq"
                value={hqId}
                onValueChange={setHqId}
                options={options}
                placeholder={hqs.isLoading ? 'Loading HQs…' : 'Choose an HQ'}
                aria-invalid={errors['hqId'] ? true : undefined}
              />
            </FormField>
            <FormField label="Name" htmlFor="new-name" error={errors['name']}>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
            </FormField>
            <FormField label="Type" htmlFor="new-type" error={errors['type']} hint="Sets which DA rate a day on this route earns. Automatic follows the distance; you can choose another type and will only be warned.">
              <Select
                id="new-type"
                value={type}
                onValueChange={setType}
                options={TYPE_OPTIONS}
                aria-invalid={errors['type'] ? true : undefined}
              />
            </FormField>
            <FormField label="TA rate override (₹ per km)" htmlFor="new-rate" error={errors['rate']} hint="Optional. Empty uses the pay band rate.">
              <Input id="new-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={errors['rate'] ? true : undefined} />
            </FormField>
          </div>
        </Card>

        <Card title="Destination" description={hq?.basePlace ? `The distance is measured by road from ${hq.basePlace.label} to the place you pick.` : 'Pick an HQ first to see where the route starts.'}>
          <div className="p-5">
            <PlacePicker
              id="new-destination"
              label="Destination"
              value={destination}
              onChange={setDestination}
              from={hq?.basePlace ?? null}
              disabled={readOnly}
              error={errors['destination']}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push('/routes')}>
            Cancel
          </Button>
          <Button type="submit" disabled={readOnly || create.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
            {create.isPending ? 'Creating…' : 'Create route'}
          </Button>
        </div>
      </form>
    </>
  );
}
