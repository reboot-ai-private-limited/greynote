'use client';

import type { UserListItemDto, UserListStatus } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/SessionProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ListToolbar, SearchInput } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { EmployeeDraftsCard } from './EmployeeDraftsCard';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { Avatar } from './Avatar';
import { useDesignations } from '../hooks/useMasterData';
import { useUsers } from '../hooks/useUsers';
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/user';

const ANY = 'all';
const withAny = (label: string, options: { value: string; label: string }[]) => [
  { value: ANY, label },
  ...options,
];

const ROLE_OPTIONS = withAny(
  'All roles',
  Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
);
const STATUS_OPTIONS = withAny(
  'All statuses',
  Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
);

export function EmployeesScreen() {
  const { values, page, pageSize, update } = useFilterParams([
    'search',
    'role',
    'status',
    'designationId',
  ]);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const router = useRouter();
  const { user: me } = useSession();
  const readOnly = useIsReadOnly();
  const designations = useDesignations();
  const zones = useAllZones();
  const hqs = useAllHqs();

  const users = useUsers({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.role && { role: values.role as UserListItemDto['role'] }),
    ...(values.status && { status: values.status as UserListStatus }),
    ...(values.designationId && { designationId: values.designationId }),
  });

  const zoneName = new Map((zones.data ?? []).map((z) => [z.id, z.name]));
  const hqName = new Map((hqs.data ?? []).map((h) => [h.id, h.name]));
  const designationName = new Map((designations.data ?? []).map((d) => [d.id, d.name]));
  const designationOptions = withAny(
    'All designations',
    [...(designations.data ?? [])]
      .sort((a, b) => a.level - b.level)
      .map((d) => ({ value: d.id, label: d.name })),
  );

  const columns: readonly Column<UserListItemDto>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (u) => (
        <Link
          href={`/employees/${u.id}`}
          className="flex items-center gap-2 font-medium text-text hover:text-accent hover:underline"
        >
          <Avatar name={u.name} url={u.photoUrl} />
          {u.name}
        </Link>
      ),
    },
    {
      key: 'code',
      header: 'Employee ID',
      render: (u) => <span className="tabular-nums text-text-muted">{u.employeeCode}</span>,
    },
    {
      key: 'designation',
      header: 'Designation',
      // Office staff have no designation: their role says what they are.
      render: (u) =>
        u.designationId ? (
          (designationName.get(u.designationId) ?? '—')
        ) : u.role === 'FIELD' ? (
          <span className="text-text-subtle">—</span>
        ) : (
          <span className="text-text-muted">{ROLE_LABEL[u.role]}</span>
        ),
    },
    {
      key: 'manager',
      header: 'Manager',
      render: (u) => u.managerName ?? <span className="text-text-subtle">—</span>,
    },
    {
      key: 'zone',
      header: 'Zone',
      render: (u) => {
        const zone = u.zoneId ? zoneName.get(u.zoneId) : undefined;
        const hq = u.hqId ? hqName.get(u.hqId) : undefined;
        return zone ? (
          <div>
            <div>{zone}</div>
            {hq ? <div className="text-xs text-text-subtle">{hq}</div> : null}
          </div>
        ) : (
          <span className="text-text-subtle">—</span>
        );
      },
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
        actions={
          <div className="flex items-center gap-2">
            {me?.role === 'ADMIN' ? (
              <Button
                variant="secondary"
                onClick={() => router.push('/employees/new/staff')}
                disabled={readOnly}
              >
                Add office staff
              </Button>
            ) : null}
            <Button
              onClick={() => router.push('/employees/new')}
              disabled={readOnly}
              title={readOnly ? 'A past financial year is read-only' : undefined}
            >
              <Plus aria-hidden className="size-4" /> New employee
            </Button>
          </div>
        }
      />
      <EmployeeDraftsCard />
      <ListToolbar>
        <SearchInput
          label="Search employees"
          placeholder="Search by name or code"
          value={search}
          onChange={setSearch}
        />
        <div className="w-44">
          <Select
            aria-label="Role"
            value={values.role || ANY}
            options={ROLE_OPTIONS}
            onValueChange={(v) => update({ role: v === ANY ? '' : v })}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label="Status"
            value={values.status || ANY}
            options={STATUS_OPTIONS}
            onValueChange={(v) => update({ status: v === ANY ? '' : v })}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label="Designation"
            value={values.designationId || ANY}
            options={designationOptions}
            onValueChange={(v) => update({ designationId: v === ANY ? '' : v })}
          />
        </div>
      </ListToolbar>
      <TopProgressBar active={users.isFetching && !users.isLoading} />
      <DataState
        isLoading={users.isLoading}
        error={users.error ? toErrorState(users.error, () => void users.refetch()) : null}
        isEmpty={users.data?.items.length === 0}
        empty={{ title: 'No employees', description: 'No employee matches these filters.' }}
      >
        <DataTable
          columns={columns}
          rows={users.data?.items ?? []}
          rowKey={(u) => u.id}
          onRowClick={(u) => router.push(`/employees/${u.id}`)}
        />
        {users.data ? (
          <Pagination
            page={users.data.page}
            pageSize={pageSize}
            totalPages={users.data.totalPages}
            total={users.data.total}
            onPageChange={(p) => update({ page: p })}
            onPageSizeChange={(n) => update({ pageSize: n })}
          />
        ) : null}
      </DataState>
    </>
  );
}
