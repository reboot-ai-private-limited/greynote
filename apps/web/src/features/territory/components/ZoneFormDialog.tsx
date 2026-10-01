'use client';

import type { ZoneDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useCreateZone, useUpdateZone } from '../hooks/useTerritoryMutations';
import { buildZone, changedZoneFields } from '../lib/draft';
import { FormDialog } from './FormDialog';

/** Create (no `zone`) or rename (`zone`). Mounted only while open, so its draft is fresh each time. */
export function ZoneFormDialog({ zone, onClose }: { zone?: ZoneDto | undefined; onClose: () => void }) {
  const [name, setName] = useState(zone?.name ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateZone(onClose);
  const update = useUpdateZone(onClose);

  function submit() {
    if (zone) {
      const body = changedZoneFields(zone, { name });
      if (Object.keys(body).length === 0) return onClose();
      const built = buildZone({ name });
      if (!built.ok) return setErrors(built.errors);
      return update.mutate({ id: zone.id, body });
    }
    const built = buildZone({ name });
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={zone ? 'Edit zone' : 'New zone'}
      description="The top of the territory hierarchy, e.g. West Bengal."
      formId="zone-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="zone-name" error={errors['name']}>
        <Input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
