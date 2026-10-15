'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useSession } from '@/lib/auth/SessionProvider';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useCreateUser } from '../hooks/useUsers';
import { PasswordField } from './PasswordField';
import { EMPTY_USER_DRAFT, ROLE_LABEL, buildUser, creatableRoles, type UserDraft } from '../lib/user';

export function EmployeeCreateScreen() {
  const router = useRouter();
  const { user } = useSession();
  const readOnly = useIsReadOnly();
  // Field employees are added through the step-by-step wizard; this form is for office logins.
  const roles = creatableRoles(user?.role).filter((r) => r !== 'FIELD');
  // HR can only create field employees, so the choice is made for them.
  const [draft, setDraft] = useState<UserDraft>({ ...EMPTY_USER_DRAFT, role: roles.length === 1 ? (roles[0] ?? '') : '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateUser((created) => router.push(`/employees/${created.id}`));

  const set = (field: keyof UserDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  function submit() {
    const built = buildUser(draft, user?.role);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/employees" className="text-text-muted hover:text-accent hover:underline">
          ← Employees
        </Link>
      </p>
      <PageHeader title="Add office staff" description="The employee code (GHC…) is generated automatically." />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <FormField label="Role" htmlFor="user-role" error={errors['role']}>
              <Select
                id="user-role"
                value={draft.role}
                onValueChange={set('role')}
                options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                placeholder="Choose a role"
                aria-invalid={invalid('role')}
              />
            </FormField>
            <FormField label="Full name" htmlFor="user-name" error={errors['name']}>
              <Input id="user-name" value={draft.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
            </FormField>
            <PasswordField
              id="user-password"
              label="Initial password"
              hint=""
              value={draft.password}
              error={errors['password']}
              onChange={set('password')}
            />
            <FormField label="Email (optional)" htmlFor="user-email" error={errors['email']}>
              <Input id="user-email" type="email" value={draft.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={invalid('email')} />
            </FormField>
            <FormField label="Phone (optional)" htmlFor="user-phone">
              <Input id="user-phone" inputMode="tel" value={draft.phone} onChange={(e) => set('phone')(e.target.value)} />
            </FormField>
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly || create.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
            {create.isPending ? 'Creating…' : 'Create employee'}
          </Button>
        </div>
      </form>
    </>
  );
}
