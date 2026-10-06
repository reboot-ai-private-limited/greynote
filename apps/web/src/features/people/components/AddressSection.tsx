'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useUpdateUser } from '../hooks/useUsers';
import { addressToDraft, buildAddress, type AddressDraft } from '../lib/profile';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';

export function AddressSection({ user, readOnly, startEditing = false }: { user: UserDetailDto; readOnly: boolean; startEditing?: boolean }) {
  const a = user.profile?.address;
  return (
    <SectionCard
      startEditing={startEditing}
      title="Address"
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label="District">{a?.district}</Field>
          <Field label="State">{a?.state}</Field>
          <Field label="Pincode">{a?.pincode}</Field>
          <Field label="Country">{a?.country}</Field>
        </FieldList>
      }
      renderForm={(close) => <AddressForm user={user} onDone={close} />}
    />
  );
}

function AddressForm({ user, onDone }: { user: UserDetailDto; onDone: () => void }) {
  const before = user.profile?.address;
  const [draft, setDraft] = useState<AddressDraft>(addressToDraft(before));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateUser(user.id, onDone);
  const set = (field: keyof AddressDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildAddress(before, draft);
    if (!built.ok) return setErrors(built.errors);
    if (Object.keys(built.body).length === 0) return onDone();
    update.mutate(built.body);
  }

  return (
    <SectionForm pending={update.isPending} onCancel={onDone} onSubmit={submit}>
      <FormField label="District" htmlFor="addr-district" error={errors['district']}>
        <Input id="addr-district" value={draft.district} onChange={(e) => set('district')(e.target.value)} aria-invalid={invalid('district')} />
      </FormField>
      <FormField label="State" htmlFor="addr-state" error={errors['state']}>
        <Input id="addr-state" value={draft.state} onChange={(e) => set('state')(e.target.value)} aria-invalid={invalid('state')} />
      </FormField>
      <FormField label="Pincode" htmlFor="addr-pincode" error={errors['pincode']}>
        <Input id="addr-pincode" inputMode="numeric" value={draft.pincode} onChange={(e) => set('pincode')(e.target.value)} aria-invalid={invalid('pincode')} />
      </FormField>
      <FormField label="Country" htmlFor="addr-country" error={errors['country']}>
        <Input id="addr-country" value={draft.country} onChange={(e) => set('country')(e.target.value)} aria-invalid={invalid('country')} />
      </FormField>
    </SectionForm>
  );
}
