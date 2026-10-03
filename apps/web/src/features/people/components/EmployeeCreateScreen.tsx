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
import { EMPTY_USER_DRAFT, ROLE_LABEL, buildUser, creatableRoles, generatePassword, secureRandom, type UserDraft } from '../lib/user';

export function EmployeeCreateScreen() {
  const router = useRouter();
  const { user } = useSession();
  const readOnly = useIsReadOnly();
  const roles = creatableRoles(user?.role);
  // HR can only create field employees, so the choice is made for them.
  const [draft, setDraft] = useState<UserDraft>({ ...EMPTY_USER_DRAFT, role: roles.length === 1 ? (roles[0] ?? '') : '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState(false);
  const create = useCreateUser(() => router.push('/employees'));

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
      <PageHeader
        title="New employee"
        description="Create the login first. A field employee's profile, designation, pay band and manager are filled in afterwards."
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card title="Login">
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
            <FormField label="Employee code" htmlFor="user-code" error={errors['employeeCode']} hint="What they sign in with.">
              <Input id="user-code" value={draft.employeeCode} onChange={(e) => set('employeeCode')(e.target.value)} aria-invalid={invalid('employeeCode')} />
            </FormField>
            <FormField label="Full name" htmlFor="user-name" error={errors['name']}>
              <Input id="user-name" value={draft.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
            </FormField>
            <FormField label="Initial password" htmlFor="user-password" error={errors['password']} hint="Share it with the employee. Only an Admin can reset it later.">
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(e) => set('password')(e.target.value)}
                  aria-invalid={invalid('password')}
                />
                <Button variant="secondary" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
                  {reveal ? 'Hide' : 'Show'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    set('password')(generatePassword(secureRandom));
                    setReveal(true);
                  }}
                >
                  Generate
                </Button>
              </div>
            </FormField>
            <FormField label="Email" htmlFor="user-email" error={errors['email']} hint="Optional.">
              <Input id="user-email" type="email" value={draft.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={invalid('email')} />
            </FormField>
            <FormField label="Phone" htmlFor="user-phone" hint="Optional.">
              <Input id="user-phone" inputMode="tel" value={draft.phone} onChange={(e) => set('phone')(e.target.value)} />
            </FormField>
          </div>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/employees')}>
            Cancel
          </Button>
          <Button type="submit" disabled={readOnly || create.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
            {create.isPending ? 'Creating…' : 'Create employee'}
          </Button>
        </div>
      </form>
    </>
  );
}
