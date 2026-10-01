'use client';

import type { HqDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateHq, useUpdateHq } from '../hooks/useTerritoryMutations';
import { useZoneOptions } from '../hooks/useParentOptions';
import { buildHq, changedZoneFields } from '../lib/draft';
import { FormDialog } from './FormDialog';

/** Create, or rename (`hq`). An HQ cannot move to another zone, so the zone is read-only on edit. */
export function HqFormDialog({
  hq,
  defaultZoneId,
  onClose,
}: {
  hq?: HqDto | undefined;
  /** Preselects the zone when adding from a zone's row. */
  defaultZoneId?: string | undefined;
  onClose: () => void;
}) {
  const [name, setName] = useState(hq?.name ?? '');
  const [zoneId, setZoneId] = useState(hq?.zoneId ?? defaultZoneId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const zones = useZoneOptions();
  const create = useCreateHq(onClose);
  const update = useUpdateHq(onClose);

  function submit() {
    if (hq) {
      const body = changedZoneFields(hq, { name });
      if (Object.keys(body).length === 0) return onClose();
      const built = buildHq({ zoneId: hq.zoneId, name });
      if (!built.ok) return setErrors(built.errors);
      return update.mutate({ id: hq.id, body });
    }
    const built = buildHq({ zoneId, name });
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={hq ? 'Edit HQ' : 'New HQ'}
      description="A headquarters under one zone, e.g. Siliguri."
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
    </FormDialog>
  );
}
