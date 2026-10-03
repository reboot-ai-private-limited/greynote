'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useUser } from '../hooks/useUsers';
import { missingForActive } from '../lib/profile';
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/user';
import { AddressSection } from './AddressSection';
import { BankSection } from './BankSection';
import { BasicSection } from './BasicSection';
import { Field, FieldList } from './SectionCard';
import { WorkSection } from './WorkSection';

export function EmployeeDetailScreen({ id }: { id: string }) {
  const readOnly = useIsReadOnly();
  const query = useUser(id);
  const user = query.data;
  const missing = user ? missingForActive(user) : [];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/employees" className="text-text-muted hover:text-accent hover:underline">
          ← Employees
        </Link>
      </p>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!user}
        empty={{ title: 'Employee not found' }}
        skeleton={
          <div role="status" aria-label="Loading" className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        }
      >
        {user ? (
          <>
            <PageHeader
              title={user.name}
              description={`${user.employeeCode} · ${ROLE_LABEL[user.role]}`}
              actions={
                <div className="flex items-center gap-2">
                  {user.isBlocked ? <Badge tone="danger">Blocked</Badge> : null}
                  <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
                </div>
              }
            />
            {missing.length > 0 ? (
              <div role="status" className="mb-6 rounded-lg border border-border bg-warning-bg p-4 text-sm text-warning-fg">
                <p className="font-medium">Still to fill in before this employee is active:</p>
                <p className="mt-1">{missing.join(' · ')}</p>
              </div>
            ) : null}
            {user.role === 'FIELD' ? (
              <Tabs defaultValue="profile">
                <TabsList>
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="bank">Bank</TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="mt-6 space-y-6">
                  <BasicSection user={user} readOnly={readOnly} />
                  <AddressSection user={user} readOnly={readOnly} />
                  <WorkSection user={user} readOnly={readOnly} />
                </TabsContent>
                <TabsContent value="bank" className="mt-6">
                  <BankSection user={user} readOnly={readOnly} />
                </TabsContent>
              </Tabs>
            ) : (
              <Card title="Account" description="Designation, pay band, bank details and devices apply to the field force only.">
                <div className="p-5">
                  <FieldList>
                    <Field label="Email">{user.email}</Field>
                    <Field label="Phone">{user.phone}</Field>
                    <Field label="Last sign-in">{user.lastLoginAt ? formatDate(user.lastLoginAt) : null}</Field>
                  </FieldList>
                </div>
              </Card>
            )}
          </>
        ) : null}
      </DataState>
    </>
  );
}
