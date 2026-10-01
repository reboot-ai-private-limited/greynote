'use client';

import { AREA_TYPES, type AreaDto, type AreaType } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateArea, useUpdateArea } from '../hooks/useTerritoryMutations';
import { useHqOptions } from '../hooks/useParentOptions';
import { AREA_TYPE_LABEL, buildArea, changedAreaFields } from '../lib/draft';
import { FormDialog } from './FormDialog';

export const AREA_TYPE_OPTIONS = AREA_TYPES.map((t) => ({ value: t, label: AREA_TYPE_LABEL[t] }));

/** Create, or edit name/type (`area`). An Area cannot move to another HQ. */
export function AreaFormDialog({ area, onClose }: { area?: AreaDto | undefined; onClose: () => void }) {
  const [name, setName] = useState(area?.name ?? '');
  const [hqId, setHqId] = useState(area?.hqId ?? '');
  const [type, setType] = useState<string>(area?.type ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const hqs = useHqOptions();
  const create = useCreateArea(onClose);
  const update = useUpdateArea(onClose);

  function submit() {
    const built = buildArea({ hqId: area?.hqId ?? hqId, name, type });
    if (!built.ok) return setErrors(built.errors);
    if (area) {
      const body = changedAreaFields(area, { name: built.body.name, type: built.body.type as AreaType });
      if (Object.keys(body).length === 0) return onClose();
      return update.mutate({ id: area.id, body });
    }
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={area ? 'Edit area' : 'New area'}
      description="An area under one HQ. Its type decides which DA rate applies to a day worked there."
      formId="area-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="HQ" htmlFor="area-hq" error={errors['hqId']} {...(area ? { hint: 'An area cannot move to another HQ.' } : {})}>
        {area ? (
          <Input id="area-hq" value={hqs.nameOf.get(area.hqId) ?? '—'} disabled readOnly />
        ) : (
          <Select
            id="area-hq"
            value={hqId}
            onValueChange={setHqId}
            options={hqs.options}
            placeholder={hqs.isLoading ? 'Loading HQs…' : 'Choose an HQ'}
            aria-invalid={errors['hqId'] ? true : undefined}
          />
        )}
      </FormField>
      <FormField label="Name" htmlFor="area-name" error={errors['name']}>
        <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <FormField label="Type" htmlFor="area-type" error={errors['type']}>
        <Select
          id="area-type"
          value={type}
          onValueChange={setType}
          options={AREA_TYPE_OPTIONS}
          placeholder="Choose a type"
          aria-invalid={errors['type'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
