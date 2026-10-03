'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useUpdateUser } from '../hooks/useUsers';
import { bankToDraft, buildBank, maskAccount, type BankDraft } from '../lib/profile';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';

/** Bank details, which the API returns nowhere else. The account number is masked until asked for. */
export function BankSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const b = user.profile?.bankDetails;
  const [reveal, setReveal] = useState(false);
  return (
    <SectionCard
      title="Bank details"
      description="Needed before the employee can be paid. Visible to Admin and HR only."
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label="Bank">{b?.bankName}</Field>
          <Field label="IFSC">{b?.ifsc}</Field>
          <Field label="Branch">{b?.branchName}</Field>
          <Field label="Account holder">{b?.accountHolderName}</Field>
          <Field label="Account number">
            {b ? (
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">{reveal ? b.accountNumber : maskAccount(b.accountNumber)}</span>
                <Button variant="ghost" size="sm" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
                  {reveal ? 'Hide' : 'Show'}
                </Button>
              </span>
            ) : null}
          </Field>
        </FieldList>
      }
      renderForm={(close) => <BankForm user={user} onDone={close} />}
    />
  );
}

function BankForm({ user, onDone }: { user: UserDetailDto; onDone: () => void }) {
  const before = user.profile?.bankDetails;
  const [draft, setDraft] = useState<BankDraft>(bankToDraft(before));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateUser(user.id, onDone);
  const set = (field: keyof BankDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildBank(before, draft);
    if (!built.ok) return setErrors(built.errors);
    if (Object.keys(built.body).length === 0) return onDone();
    update.mutate(built.body);
  }

  return (
    <SectionForm pending={update.isPending} onCancel={onDone} onSubmit={submit}>
      <FormField label="Bank" htmlFor="bank-name" error={errors['bankName']}>
        <Input id="bank-name" value={draft.bankName} onChange={(e) => set('bankName')(e.target.value)} aria-invalid={invalid('bankName')} />
      </FormField>
      <FormField label="IFSC" htmlFor="bank-ifsc" error={errors['ifsc']}>
        <Input id="bank-ifsc" value={draft.ifsc} onChange={(e) => set('ifsc')(e.target.value)} autoCapitalize="characters" aria-invalid={invalid('ifsc')} />
      </FormField>
      <FormField label="Branch" htmlFor="bank-branch" hint="Optional.">
        <Input id="bank-branch" value={draft.branchName} onChange={(e) => set('branchName')(e.target.value)} />
      </FormField>
      <FormField label="Account holder" htmlFor="bank-holder" error={errors['accountHolderName']}>
        <Input id="bank-holder" value={draft.accountHolderName} onChange={(e) => set('accountHolderName')(e.target.value)} aria-invalid={invalid('accountHolderName')} />
      </FormField>
      <FormField label="Account number" htmlFor="bank-account" error={errors['accountNumber']}>
        <Input id="bank-account" inputMode="numeric" autoComplete="off" value={draft.accountNumber} onChange={(e) => set('accountNumber')(e.target.value)} aria-invalid={invalid('accountNumber')} />
      </FormField>
    </SectionForm>
  );
}
