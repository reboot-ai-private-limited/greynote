'use client';

import type { HqDto, PlaceDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateHq, useUpdateHq } from '../hooks/useTerritoryMutations';
import { useZoneOptions } from '../hooks/useParentOptions';
import { buildHq, changedHqFields, normalizeName } from '../lib/draft';
import { samePlace } from '../lib/place';
import { FormDialog } from '@/components/ui/FormDialog';
import { PlacePicker } from './PlacePicker';

/**
 * Create, or edit (`hq`). An HQ cannot move to another zone, so the zone is read-only on edit.
 * The base place is where every one of the HQ's routes starts; changing it recalculates their distances.
 */
export function HqFormDialog({ hq, onClose }: { hq?: HqDto | undefined; onClose: () => void }) {
  const [name, setName] = useState(hq?.name ?? '');
  const [zoneId, setZoneId] = useState(hq?.zoneId ?? '');
  const [basePlace, setBasePlace] = useState<PlaceDto | null>(hq?.basePlace ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const zones = useZoneOptions();
  const create = useCreateHq(onClose);
  const update = useUpdateHq(onClose);

  const moved = hq !== undefined && basePlace !== null && !samePlace(basePlace, hq.basePlace);

  function submit() {
    if (hq) {
      const body = changedHqFields(hq, { name, basePlace });
      if (Object.keys(body).length === 0) return onClose();
      if (body.name !== undefined && normalizeName(name) === '') return setErrors({ name: 'Enter a name.' });
      setErrors({});
      return update.mutate({ id: hq.id, body });
    }
    const built = buildHq({ zoneId, name, basePlace });
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={hq ? 'Edit HQ' : 'New HQ'}
      description="A headquarters under one zone, e.g. SLG-1, based in Siliguri."
      formId="hq-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Zone" htmlFor="hq-zone" error={errors['zoneId']} {...(hq ? { hint: 'An HQ cannot move to another zone.' } : {})}>
        {hq ? (
          <Input id="hq-zone" value={zones.nameOf.get(hq.zoneId) ?? '—'} disabled readOnly />
        ) : (
          <Select
            id="hq-zone"
            value={zoneId}
            onValueChange={setZoneId}
            options={zones.options}
            placeholder={zones.isLoading ? 'Loading zones…' : 'Choose a zone'}
            aria-invalid={errors['zoneId'] ? true : undefined}
          />
        )}
      </FormField>
      <FormField label="Name" htmlFor="hq-name" error={errors['name']}>
        <Input id="hq-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <PlacePicker
        id="hq-base-place"
        label="Base place"
        hint="Where this HQ's routes start, e.g. Siliguri. Each route's distance is measured from here."
        value={basePlace}
        onChange={setBasePlace}
        error={errors['basePlace']}
        stacked
      />
      {hq && !hq.basePlace ? (
        <p className="rounded-md bg-surface-subtle p-3 text-[13px] text-text-muted">
          This HQ has no base place yet, so it cannot have routes. Setting it also recalculates the distances of any routes it already has.
        </p>
      ) : null}
      {moved && hq?.basePlace ? (
        <p role="status" className="rounded-md bg-surface-subtle p-3 text-[13px] text-text-muted">
          Saving recalculates this HQ&rsquo;s routes from the new base place. A route whose distance was entered by hand keeps it, and is listed afterwards so you can check it.
        </p>
      ) : null}
    </FormDialog>
  );
}
