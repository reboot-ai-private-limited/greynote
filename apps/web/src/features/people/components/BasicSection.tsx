'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { formatDate } from '@/lib/format';
import { istDate } from '@/lib/dates';
import { useUpdateUser } from '../hooks/useUsers';
import { basicToDraft, buildBasic, type BasicDraft } from '../lib/profile';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';

export function BasicSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const p = user.profile;
  return (
    <SectionCard
      title="Personal details"
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label="Name">{user.name}</Field>
          <Field label="Mobile">{p?.mobileNumber}</Field>
          <Field label="Date of birth">{p?.dateOfBirth ? formatDate(p.dateOfBirth) : null}</Field>
          <Field label="Date of joining">{p?.dateOfJoining ? formatDate(p.dateOfJoining) : null}</Field>
          <Field label="Guardian">{p?.guardianName}</Field>
          <Field label="Qualification">{p?.qualification}</Field>
        </FieldList>
      }
      renderForm={(close) => <BasicForm user={user} onDone={close} />}
    />
  );
}

function BasicForm({ user, onDone }: { user: UserDetailDto; onDone: () => void }) {
  const [draft, setDraft] = useState<BasicDraft>(basicToDraft(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateUser(user.id, onDone);
  const set = (field: keyof BasicDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildBasic(user, draft, istDate());
    if (!built.ok) return setErrors(built.errors);
    if (Object.keys(built.body).length === 0) return onDone();
    update.mutate(built.body);
  }

  return (
    <SectionForm pending={update.isPending} onCancel={onDone} onSubmit={submit}>
      <FormField label="Name" htmlFor="basic-name" error={errors['name']}>
        <Input id="basic-name" value={draft.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
      </FormField>
      <FormField label="Mobile" htmlFor="basic-mobile" error={errors['mobileNumber']}>
        <Input id="basic-mobile" inputMode="tel" value={draft.mobileNumber} onChange={(e) => set('mobileNumber')(e.target.value)} aria-invalid={invalid('mobileNumber')} />
      </FormField>
      <FormField label="Date of birth" htmlFor="basic-dob" error={errors['dateOfBirth']}>
        <Input id="basic-dob" type="date" max={istDate()} value={draft.dateOfBirth} onChange={(e) => set('dateOfBirth')(e.target.value)} aria-invalid={invalid('dateOfBirth')} />
      </FormField>
      <FormField label="Date of joining" htmlFor="basic-doj" error={errors['dateOfJoining']} hint="Optional.">
        <Input id="basic-doj" type="date" value={draft.dateOfJoining} onChange={(e) => set('dateOfJoining')(e.target.value)} aria-invalid={invalid('dateOfJoining')} />
      </FormField>
      <FormField label="Guardian" htmlFor="basic-guardian" hint="Optional.">
        <Input id="basic-guardian" value={draft.guardianName} onChange={(e) => set('guardianName')(e.target.value)} />
      </FormField>
      <FormField label="Qualification" htmlFor="basic-qualification" hint="Optional.">
        <Input id="basic-qualification" value={draft.qualification} onChange={(e) => set('qualification')(e.target.value)} />
      </FormField>
    </SectionForm>
  );
}
