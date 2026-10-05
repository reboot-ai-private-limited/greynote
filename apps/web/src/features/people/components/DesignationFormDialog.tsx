'use client';

import type { DesignationDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { useCreateDesignation } from '../hooks/useMasterData';
import { DESIGNATION_LABEL, buildDesignation } from '../lib/masterData';

/** Adds one of the five designations. The rank (MR 1 … NSM 5) follows from the name, so there is nothing else to fill in. */
export function DesignationFormDialog({
  availableNames,
  onClose,
}: {
  availableNames: readonly DesignationDto['name'][];
  onClose: () => void;
}) {
  const [name, setName] = useState<string>(availableNames[0] ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDesignation(onClose);

  function submit() {
    const built = buildDesignation({ name });
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title="New designation"
      description="Its rank in the reporting chain is fixed by the name: MR 1, ASM 2, RSM 3, ZSM 4, NSM 5."
      formId="designation-form"
      pending={create.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Designation" htmlFor="designation-name" error={errors['name']}>
        <Select
          id="designation-name"
          value={name}
          onValueChange={setName}
          options={availableNames.map((n) => ({ value: n, label: DESIGNATION_LABEL[n] }))}
          aria-invalid={errors['name'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
