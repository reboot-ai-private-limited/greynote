'use client';

import { ROUTE_TYPES, type PlaceDto, type RouteType } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { useHqOptions } from '../hooks/useParentOptions';
import { useCreatePlace, useUpdatePlace } from '../hooks/usePlaces';
import { ROUTE_TYPE_LABEL, nameError, normalizeName } from '../lib/draft';

/**
 * Create, or edit (`place`), a town or station under an HQ. The HQ can't change once made. The type is the DA a day
 * there pays the HQ's own people; renaming or re-typing re-makes the place's routes.
 */
export function PlaceFormDialog({ place, defaultHqId, onClose }: { place?: PlaceDto | undefined; defaultHqId?: string | undefined; onClose: () => void }) {
  const hqs = useHqOptions();
  const [hqId, setHqId] = useState(place?.hqId ?? defaultHqId ?? '');
  const [name, setName] = useState(place?.name ?? '');
  const [type, setType] = useState<RouteType | ''>(place?.type ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePlace(onClose);
  const update = useUpdatePlace(onClose);

  function submit() {
    const clean = normalizeName(name);
    const next = {
      hqId: hqId ? undefined : 'Choose an HQ.',
      name: nameError(clean),
      type: type ? undefined : 'Choose a type.',
    };
    if (next.hqId || next.name || next.type || !type) {
      return setErrors(Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Record<string, string>);
    }
    setErrors({});
    if (!place) return create.mutate({ hqId, name: clean, type });
    const body = { ...(clean !== place.name && { name: clean }), ...(type !== place.type && { type }) };
    if (Object.keys(body).length === 0) return onClose();
    update.mutate({ id: place.id, body });
  }

  return (
    <FormDialog
      title={place ? 'Edit place' : 'New place'}
      description="A town or station under an HQ, e.g. Naxalbari. Routes run from one place to another."
      formId="place-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="HQ" htmlFor="place-hq" error={errors['hqId']} {...(place ? { hint: 'A place cannot move to another HQ.' } : {})}>
        {place ? (
          <Input id="place-hq" value={hqs.nameOf.get(place.hqId) ?? '—'} disabled readOnly />
        ) : (
          <SearchableSelect
            id="place-hq"
            value={hqId}
            onValueChange={setHqId}
            options={hqs.options}
            placeholder={hqs.isLoading ? 'Loading HQs…' : 'Choose an HQ'}
            searchPlaceholder="Search HQs"
            aria-invalid={errors['hqId'] ? true : undefined}
          />
        )}
      </FormField>
      <FormField label="Name" htmlFor="place-name" error={errors['name']} {...(place ? { hint: 'Renaming re-names its routes.' } : {})}>
        <Input id="place-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <FormField
        label="Type"
        htmlFor="place-type"
        error={errors['type']}
        hint="The DA a day here pays this HQ's own people. For anyone from another HQ it is always out-station. A change applies to DA from now on."
      >
        <Select
          id="place-type"
          value={type}
          onValueChange={(v) => setType(v as RouteType)}
          placeholder="Choose a type"
          options={ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }))}
          aria-invalid={errors['type'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
