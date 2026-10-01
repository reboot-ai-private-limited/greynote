'use client';

import type { WaypointDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAreaOptions } from '../hooks/useAreaOptions';
import { useCreateRoute } from '../hooks/useRouteMutations';
import { buildRoute } from '../lib/routeDraft';
import { StopsEditor } from './StopsEditor';

export function RouteCreateScreen() {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const areas = useAreaOptions();
  const [areaId, setAreaId] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [stops, setStops] = useState<WaypointDto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateRoute((route) => router.push(`/routes/${route.id}`));

  function submit() {
    const built = buildRoute({ areaId, name, rate, waypoints: stops });
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
      <PageHeader title="New route" description="Choose an area, name the route, and add its stops in travel order." />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card title="Details">
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            <FormField label="Area" htmlFor="new-area" error={errors['areaId']}>
              <Select
                id="new-area"
                value={areaId}
                onValueChange={setAreaId}
                options={areas.options}
                placeholder={areas.isLoading ? 'Loading areas…' : 'Choose an area'}
                aria-invalid={errors['areaId'] ? true : undefined}
              />
            </FormField>
            <FormField label="Name" htmlFor="new-name" error={errors['name']}>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
            </FormField>
            <FormField label="TA rate override (₹ per km)" htmlFor="new-rate" error={errors['rate']} hint="Optional. Empty uses the pay band rate.">
              <Input id="new-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={errors['rate'] ? true : undefined} />
            </FormField>
          </div>
        </Card>

        <Card title="Stops" description="Start, any stops in between, and the end. Order matters and is kept exactly as set.">
          <div className="p-5">
            <StopsEditor stops={stops} onChange={setStops} disabled={readOnly} error={errors['waypoints']} />
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
