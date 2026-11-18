'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useUpdateUser } from '../hooks/useUsers';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The employee's email: where **password reset codes** are sent when they forget their password. Shown for every account (field or office), editable by whoever can
 * edit the employee. With none saved the person can't reset a forgotten password by code and is told to contact an Admin, so the missing address is called out.
 */
export function EmailSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  return (
    <SectionCard
      title="Email"
      readOnly={readOnly}
      view={
        <div className="space-y-3">
          <FieldList>
            <Field label="Email">{user.email}</Field>
          </FieldList>
          {user.email ? (
            <p className="text-xs text-text-muted">Password reset codes are sent to this address.</p>
          ) : (
            <p role="status" className="rounded-md border border-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
              No email saved: this person cannot reset a forgotten password with a code. Add one.
            </p>
          )}
        </div>
      }
      renderForm={(close) => <EmailForm user={user} onDone={close} />}
    />
  );
}

function EmailForm({ user, onDone }: { user: UserDetailDto; onDone: () => void }) {
  const [value, setValue] = useState(user.email ?? '');
  const [error, setError] = useState<string | undefined>();
  const update = useUpdateUser(user.id, onDone);

  function submit() {
    const next = value.trim().toLowerCase();
    if (next !== '' && !LOOKS_LIKE_EMAIL.test(next)) return setError('Enter a valid email address.');
    setError(undefined);
    if (next === (user.email ?? '')) return onDone();
    update.mutate({ email: next === '' ? null : next });
  }

  return (
    <SectionForm pending={update.isPending} onCancel={onDone} onSubmit={submit}>
      <FormField label="Email" htmlFor="user-email-edit" error={error} hint="Password reset codes are sent here. Leave empty to remove it.">
        <Input id="user-email-edit" type="email" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? true : undefined} autoComplete="off" />
      </FormField>
    </SectionForm>
  );
}
