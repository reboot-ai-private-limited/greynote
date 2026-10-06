'use client';

import type { SpecialtyDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { squash } from '@/lib/forms';
import { useCreateSpecialty, useUpdateSpecialty } from '../hooks/useSpecialties';

const NAME_MAX = 100;

/** Add (no `specialty`) or rename (`specialty`). A rename is also made on the doctors that carry it. */
export function SpecialtyFormDialog({ specialty, onClose }: { specialty?: SpecialtyDto | undefined; onClose: () => void }) {
  const [name, setName] = useState(specialty?.name ?? '');
  const [error, setError] = useState<string | undefined>();
  const create = useCreateSpecialty(onClose);
  const update = useUpdateSpecialty(onClose);

  function submit() {
    const clean = squash(name);
    if (clean === '') return setError('Enter a name.');
    if (clean.length > NAME_MAX) return setError(`Keep the name to ${NAME_MAX} characters.`);
    setError(undefined);
    if (!specialty) return create.mutate({ name: clean });
    if (clean === specialty.name) return onClose();
    update.mutate({ id: specialty.id, body: { name: clean } });
  }

  return (
    <FormDialog
      title={specialty ? 'Rename speciality' : 'New speciality'}
      description={specialty ? 'Doctors with this speciality are renamed too.' : 'It becomes a choice when adding or editing a doctor.'}
      formId="specialty-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="specialty-name" error={error} hint="e.g. Cardiologist. The same name in another case counts as the same speciality.">
        <Input id="specialty-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
