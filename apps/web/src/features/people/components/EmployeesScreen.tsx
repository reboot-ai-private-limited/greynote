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
import { useStatusCounts, useUsers } from '../hooks/useUsers';
import { missingChipLabel } from '@/features/payroll/lib/payrollWarnings';
import { attentionItems, statusChips } from '../lib/employeeChips';
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

export function EmployeesScreen() {
  const { values, page, pageSize, update } = useFilterParams([
    'search',
    'role',
    'status',
    'designationId',
    'blocked',
    'ids',
    'missing',
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
    ...(values.blocked && { isBlocked: true as const }),
    ...(values.ids && { ids: values.ids }),
    ...(values.designationId && { designationId: values.designationId }),
  });

  // The chips count what the search, role and designation leave; the status chip and the blocked filter are the choice they offer.
  const { counts, ready } = useStatusCounts({
    ...(values.search && { search: values.search }),
    ...(values.role && { role: values.role as UserListItemDto['role'] }),
    ...(values.designationId && { designationId: values.designationId }),
  });
  const attention = attentionItems(counts);
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
            <Button variant="secondary" onClick={() => router.push('/employees/territory-gaps')}>
              Territory gaps
            </Button>
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
      {ready && attention.length > 0 && !values.status && !values.blocked && !values.ids ? (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-warning-bg px-4 py-2.5 text-sm text-warning-fg">
          <span className="font-medium">Needs attention:</span>
          {attention.map((a) => (
            <button key={a.key} type="button" className="underline hover:no-underline" onClick={() => update({ status: a.filter.status ?? '', blocked: a.filter.blocked ?? '' })}>
              {a.text}
            </button>
          ))}
        </div>
      ) : null}
      {values.ids ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed
            title="Show everyone again"
            className="rounded-full border border-warning bg-warning-bg px-3 py-1 text-sm font-medium text-warning-fg"
            onClick={() => update({ ids: '', missing: '' })}
          >
            {missingChipLabel(values.missing, users.data?.total ?? values.ids.split(',').length) || `Only ${values.ids.split(',').length} chosen employees`} ✕
          </button>
        </div>
      ) : null}
      <div role="group" aria-label="Filter by status" hidden={Boolean(values.ids)} className="mb-4 flex flex-wrap items-center gap-2">
        {statusChips(counts).map((c) => {
          const selected = !values.blocked && (values.status || '') === c.value;
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ status: c.value, blocked: '' })}
              className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:shadow-focus focus-visible:outline-none ${selected ? 'border-accent bg-accent-soft font-medium text-accent-soft-text' : 'border-border text-text-muted hover:bg-surface-hover'}`}
            >
              {c.label} <span className="tabular-nums">{ready ? c.count : '…'}</span>
            </button>
          );
        })}
        {values.blocked ? (
          <button type="button" aria-pressed className="rounded-full border border-danger bg-danger-bg px-3 py-1 text-sm font-medium text-danger-fg" onClick={() => update({ blocked: '' })}>
            Blocked {counts.blocked} ✕
          </button>
        ) : null}
      </div>
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
