'use client';

import { ROUTE_TYPES } from '@greynote/contracts';
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
import { useStationThresholds } from '../hooks/useStationThresholds';
import { AUTO_ROUTE_TYPE, ROUTE_TYPE_LABEL, autoTypeLabel } from '../lib/draft';
import { buildRoute, suggestedType } from '../lib/routeDraft';

/** HQ → destination → km → type (Automatic by default, changeable) → save. The route is named "<HQ> to <destination>". */
export function RouteCreateScreen() {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const thresholds = useStationThresholds();
  // One page of 100 (the API's cap), as for the other pickers.
  const hqs = useHqs({ page: 1, pageSize: 100, status: 'active' });
  const [hqId, setHqId] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [type, setType] = useState<string>(AUTO_ROUTE_TYPE);
  const [rate, setRate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateRoute((route) => router.push(`/routes/${route.id}`));

  const options = useMemo(() => (hqs.data?.items ?? []).map((h) => ({ value: h.id, label: h.name })), [hqs.data]);
  const hq = hqs.data?.items.find((h) => h.id === hqId);
  const suggestion = suggestedType(distanceKm, thresholds);
  const typeOptions = [{ value: AUTO_ROUTE_TYPE, label: autoTypeLabel(suggestion) }, ...ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }))];
  const routeName = hq && destinationName.trim() ? `${hq.name} to ${destinationName.trim().replace(/\s+/g, ' ')}` : null;

  function submit() {
    const built = buildRoute({ hqId, destinationName, distanceKm, type, rate });
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
      <PageHeader title="New route" description="Choose the HQ, name the destination and enter the distance in km." />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card title="Details" description={routeName ? `The route will be named “${routeName}”.` : 'The route is named “HQ to destination”.'}>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <FormField label="HQ" htmlFor="new-hq" error={errors['hqId']}>
              <Select
                id="new-hq"
                value={hqId}
                onValueChange={setHqId}
                options={options}
                placeholder={hqs.isLoading ? 'Loading HQs…' : 'Choose an HQ'}
                aria-invalid={errors['hqId'] ? true : undefined}
              />
            </FormField>
            <FormField label="Destination" htmlFor="new-destination" error={errors['destinationName']} hint="The place the MR travels to, e.g. Naxalbari.">
              <Input
                id="new-destination"
                value={destinationName}
                onChange={(e) => setDestinationName(e.target.value)}
                aria-invalid={errors['destinationName'] ? true : undefined}
              />
            </FormField>
            <FormField label="Distance (km)" htmlFor="new-km" error={errors['distanceKm']} hint="One way, by road. TA is paid on exactly this number.">
              <Input id="new-km" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} aria-invalid={errors['distanceKm'] ? true : undefined} />
            </FormField>
            <FormField label="Type" htmlFor="new-type" error={errors['type']} hint="Sets which DA rate a day on this route earns. Automatic follows the km; you can choose another type and will only be warned.">
              <Select id="new-type" value={type} onValueChange={setType} options={typeOptions} aria-invalid={errors['type'] ? true : undefined} />
            </FormField>
            <FormField label="TA rate override (₹ per km)" htmlFor="new-rate" error={errors['rate']} hint="Optional. Empty uses the pay band rate.">
              <Input id="new-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={errors['rate'] ? true : undefined} />
            </FormField>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push('/routes')}>
            Cancel
          </Button>
          <Button type="submit" disabled={readOnly || create.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
            {create.isPending ? 'Saving…' : 'Save route'}
          </Button>
        </div>
      </form>
    </>
  );
}
