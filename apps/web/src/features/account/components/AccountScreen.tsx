'use client';

import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useSession } from '@/lib/auth/SessionProvider';
import { useChangePassword } from '../hooks/useChangePassword';
import { changePasswordErrors, type ChangePasswordErrors } from '../lib/changePassword';

const EMPTY = { current: '', next: '', again: '' };

/** The signed-in person's own account: who they are, and changing their own password. Every web role. */
export function AccountScreen() {
  const { user } = useSession();
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="My account" description={user ? `${user.name} · ${user.employeeCode} · ${user.role}` : undefined} />
      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const change = useChangePassword(() => {
    setDraft(EMPTY);
    setErrors({});
  });
  const set = (key: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <Card title="Change password" description="You stay signed in here. Anywhere else you are signed in is signed out.">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const found = changePasswordErrors(draft);
          setErrors(found);
          if (Object.keys(found).length === 0) change.mutate({ currentPassword: draft.current, newPassword: draft.next });
        }}
        className="space-y-4 p-5"
      >
        <FormField label="Current password" htmlFor="current-password" error={errors.current}>
          <PasswordInput id="current-password" autoComplete="current-password" value={draft.current} onChange={set('current')} aria-invalid={errors.current ? true : undefined} />
        </FormField>
        <FormField label="New password" htmlFor="new-password" error={errors.next} hint="At least 8 characters.">
          <PasswordInput id="new-password" autoComplete="new-password" value={draft.next} onChange={set('next')} aria-invalid={errors.next ? true : undefined} />
        </FormField>
        <FormField label="Confirm new password" htmlFor="confirm-password" error={errors.again}>
          <PasswordInput id="confirm-password" autoComplete="new-password" value={draft.again} onChange={set('again')} aria-invalid={errors.again ? true : undefined} />
        </FormField>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </Card>
  );
}
