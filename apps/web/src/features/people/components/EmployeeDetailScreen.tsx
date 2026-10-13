'use client';

import type { UserDetailDto } from '@greynote/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { EmployeeCalendarTab } from '@/features/attendance/components/EmployeeCalendarTab';
import { EmployeeLeaveTab } from '@/features/hr/components/EmployeeLeaveTab';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/auth/SessionProvider';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useRemovePhoto, useSetPhoto, useUser } from '../hooks/useUsers';
import { missingForActive } from '../lib/profile';
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/user';
import { AddressSection } from './AddressSection';
import { BankSection } from './BankSection';
import { DocumentsSection } from './DocumentsSection';
import { BasicSection } from './BasicSection';
import { CompensationTab } from './CompensationTab';
import { PhotoPicker } from './PhotoPicker';
import { PromotionTab } from './PromotionTab';
import { Field, FieldList } from './SectionCard';
import { SecuritySection } from './SecuritySection';
import { UserDevicesSection } from './UserDevicesSection';
import { WorkSection } from './WorkSection';

const DETAIL_TABS = [
  'profile',
  'bank',
  'documents',
  'compensation',
  'promotion',
  'calendar',
  'leave',
  'devices',
  'security',
];

export function EmployeeDetailScreen({ id }: { id: string }) {
  const readOnly = useIsReadOnly();
  // Phones are Admin's call (the API refuses HR), so HR does not see the tab.
  const session = useSession().user;
  const isAdmin = session?.role === 'ADMIN';
  const query = useUser(id);
  const user = query.data;
  // Coming back from the CTC screen lands on the Compensation tab.
  const requested = useSearchParams().get('tab');
  const initialTab = requested && DETAIL_TABS.includes(requested) ? requested : 'profile';
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
            {user.role === 'FIELD' ? <ProfilePhoto user={user} readOnly={readOnly} /> : null}
            {missing.length > 0 ? (
              <div
                role="status"
                className="mb-6 rounded-lg border border-border bg-warning-bg p-4 text-sm text-warning-fg"
              >
                <p className="font-medium">Still to fill in before this employee is active:</p>
                <p className="mt-1">{missing.join(' · ')}</p>
                {user.role === 'FIELD' ? (
                  <p className="mt-2">
                    <Link href={`/employees/${user.id}/setup`} className="font-medium underline">
                      Continue setup
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}
            {user.role === 'FIELD' ? (
              <Tabs defaultValue={initialTab}>
                <TabsList>
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="bank">Bank</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="compensation">Compensation</TabsTrigger>
                  <TabsTrigger value="promotion">Promotion</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar</TabsTrigger>
                  <TabsTrigger value="leave">Leave</TabsTrigger>
                  {isAdmin ? <TabsTrigger value="devices">Devices</TabsTrigger> : null}
                  {isAdmin ? <TabsTrigger value="security">Security</TabsTrigger> : null}
                </TabsList>
                <TabsContent value="profile" className="mt-6 space-y-6">
                  <BasicSection user={user} readOnly={readOnly} />
                  <AddressSection user={user} readOnly={readOnly} />
                  <WorkSection user={user} readOnly={readOnly} />
                </TabsContent>
                <TabsContent value="bank" className="mt-6">
                  <BankSection user={user} readOnly={readOnly} />
                </TabsContent>
                <TabsContent value="documents" className="mt-6">
                  <DocumentsSection user={user} readOnly={readOnly} />
                </TabsContent>
                <TabsContent value="compensation" className="mt-6">
                  <CompensationTab user={user} readOnly={readOnly} />
                </TabsContent>
                <TabsContent value="promotion" className="mt-6">
                  <PromotionTab user={user} readOnly={readOnly} />
                </TabsContent>
                <TabsContent value="calendar" className="mt-6">
                  <EmployeeCalendarTab userId={user.id} />
                </TabsContent>
                <TabsContent value="leave" className="mt-6">
                  <EmployeeLeaveTab userId={user.id} />
                </TabsContent>
                {isAdmin ? (
                  <TabsContent value="devices" className="mt-6">
                    <UserDevicesSection userId={user.id} />
                  </TabsContent>
                ) : null}
                {isAdmin ? (
                  <TabsContent value="security" className="mt-6">
                    <SecuritySection user={user} selfId={session?.id} readOnly={readOnly} />
                  </TabsContent>
                ) : null}
              </Tabs>
            ) : (
              <Card
                title="Account"
                description="Designation, pay grade, bank details and devices apply to the field force only."
              >
                <div className="p-5">
                  <FieldList>
                    <Field label="Email">{user.email}</Field>
                    <Field label="Phone">{user.phone}</Field>
                    <Field label="Last sign-in">
                      {user.lastLoginAt ? formatDate(user.lastLoginAt) : null}
                    </Field>
                  </FieldList>
                </div>
              </Card>
            )}
            {user.role !== 'FIELD' && isAdmin ? (
              <div className="mt-6">
                <SecuritySection user={user} selfId={session?.id} readOnly={readOnly} />
              </div>
            ) : null}
          </>
        ) : null}
      </DataState>
    </>
  );
}

/** The employee's photo with Choose another / Remove. Both delete the old file from Cloudinary on the server. */
function ProfilePhoto({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const set = useSetPhoto(user.id);
  const remove = useRemovePhoto(user.id);
  return (
    <div className="mb-6">
      <PhotoPicker
        name={user.name}
        photoUrl={user.profile?.photoUrl ?? null}
        busy={set.isPending || remove.isPending}
        disabled={readOnly}
        onPick={(file) => set.mutate(file)}
        onRemove={() => remove.mutate()}
      />
    </div>
  );
}
