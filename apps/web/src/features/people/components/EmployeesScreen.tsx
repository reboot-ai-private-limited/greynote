'use client';

import type { UserListItemDto, UserListStatus } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDesignations } from '../hooks/useMasterData';
import { useUsers } from '../hooks/useUsers';
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/user';

const ANY = 'all';
const withAny = (label: string, options: { value: string; label: string }[]) => [{ value: ANY, label }, ...options];

const ROLE_OPTIONS = withAny(
  'All roles',
  Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
);
const STATUS_OPTIONS = withAny(
  'All statuses',
  Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
);

export function EmployeesScreen() {
  const { values, page, update } = useFilterParams(['search', 'role', 'status', 'designationId']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const designations = useDesignations();

  const users = useUsers({
    page,
    ...(values.search && { search: values.search }),
    ...(values.role && { role: values.role as UserListItemDto['role'] }),
    ...(values.status && { status: values.status as UserListStatus }),
    ...(values.designationId && { designationId: values.designationId }),
  });

  const designationName = new Map((designations.data ?? []).map((d) => [d.id, d.name]));
  const designationOptions = withAny(
    'All designations',
    [...(designations.data ?? [])].sort((a, b) => a.level - b.level).map((d) => ({ value: d.id, label: d.name })),
  );

  const columns: readonly Column<UserListItemDto>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (u) => (
        <div>
          <Link href={`/employees/${u.id}`} className="font-medium text-text hover:text-accent hover:underline">
            {u.name}
          </Link>
          <div className="text-xs text-text-subtle">{u.employeeCode}</div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => ROLE_LABEL[u.role] },
    {
      key: 'designation',
      header: 'Designation',
      render: (u) => (u.designationId ? (designationName.get(u.designationId) ?? '—') : <span className="text-text-subtle">—</span>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone with a login. A field employee stays in onboarding until their profile is complete."
        actions={
          <Button
            onClick={() => router.push('/employees/new')}
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
          >
            <Plus aria-hidden className="size-4" /> New employee
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Input
            placeholder="Search by name or code"
            aria-label="Search employees"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="w-44">
            <Select aria-label="Role" value={values.role || ANY} options={ROLE_OPTIONS} onValueChange={(v) => update({ role: v === ANY ? '' : v })} />
          </div>
          <div className="w-44">
            <Select aria-label="Status" value={values.status || ANY} options={STATUS_OPTIONS} onValueChange={(v) => update({ status: v === ANY ? '' : v })} />
          </div>
          <div className="w-44">
            <Select
              aria-label="Designation"
              value={values.designationId || ANY}
              options={designationOptions}
              onValueChange={(v) => update({ designationId: v === ANY ? '' : v })}
            />
          </div>
        </div>
        <TopProgressBar active={users.isFetching && !users.isLoading} />
        <DataState
          isLoading={users.isLoading}
          error={users.error ? toErrorState(users.error, () => void users.refetch()) : null}
          isEmpty={users.data?.items.length === 0}
          empty={{ title: 'No employees', description: 'No employee matches these filters.' }}
        >
          <DataTable columns={columns} rows={users.data?.items ?? []} rowKey={(u) => u.id} />
          {users.data ? (
            <Pagination
              page={users.data.page}
              totalPages={users.data.totalPages}
              total={users.data.total}
              onPageChange={(p) => update({ page: p })}
            />
          ) : null}
        </DataState>
      </Card>
    </>
  );
}
