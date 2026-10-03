'use client';

import type { DesignationDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateDesignation, useUpdateDesignation } from '../hooks/useMasterData';
import { DESIGNATION_LABEL, buildDesignation, buildDesignationUpdate } from '../lib/masterData';

/**
 * Create (no `designation`) or change the level (`designation`). Mounted only while open.
 * `availableNames` are the designations not yet created; an edit cannot rename one.
 */
export function DesignationFormDialog({
  designation,
  availableNames,
  onClose,
}: {
  designation?: DesignationDto | undefined;
  availableNames: readonly DesignationDto['name'][];
  onClose: () => void;
}) {
  const [name, setName] = useState<string>(designation?.name ?? availableNames[0] ?? '');
  const [level, setLevel] = useState(designation ? String(designation.level) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDesignation(onClose);
  const update = useUpdateDesignation(onClose);

  function submit() {
    if (designation) {
      const built = buildDesignationUpdate(designation, level);
      if (!built.ok) return setErrors(built.errors);
      if (Object.keys(built.body).length === 0) return onClose();
      return update.mutate({ id: designation.id, body: built.body });
    }
    const built = buildDesignation({ name, level });
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={designation ? `Edit ${designation.name}` : 'New designation'}
      description="The level is the rank in the reporting chain: 1 reports up to 2, and so on."
      formId="designation-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Designation" htmlFor="designation-name" error={errors['name']}>
        {designation ? (
          <Input id="designation-name" value={DESIGNATION_LABEL[designation.name]} disabled readOnly />
        ) : (
          <Select
            id="designation-name"
            value={name}
            onValueChange={setName}
            options={availableNames.map((n) => ({ value: n, label: DESIGNATION_LABEL[n] }))}
            aria-invalid={errors['name'] ? true : undefined}
          />
        )}
      </FormField>
      <FormField label="Level" htmlFor="designation-level" error={errors['level']}>
        <Input
          id="designation-level"
          inputMode="numeric"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          aria-invalid={errors['level'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
