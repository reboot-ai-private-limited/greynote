'use client';

import type { DistributorDto, MasterStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useSession } from '@/lib/auth/SessionProvider';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDistributorBalances, useDistributorOutstanding, useDistributorPaymentTotals } from '../hooks/useDistributorPayments';
import { useDistributors, useUpdateDistributor } from '../hooks/useDistributors';
import { paymentRange } from '../lib/payments';
import { DeleteDistributorDialog } from './DeleteDistributorDialog';
import { DistributorTotals } from './DistributorTotals';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { EmployeeFilter } from '@/features/people/components/EmployeePickerField';
import { RouteFilter } from './RoutePickerField';

const ANY = 'all';
const money = (paise: number): string => formatMoney(paise);

/** The first two places and how many more. */
const routesText = (labels: string[]) =>
  labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;

/** The distributors list: Admin and the Accountant both add, edit and record payments here. */
export function DistributorsScreen() {
  const router = useRouter();
  const { values, page, pageSize, update } = useFilterParams([
    'search',
    'status',
    'routeId',
    'hqId',
    'zoneId',
    'assignedUserId',
  ]);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const [toggling, setToggling] = useState<DistributorDto | null>(null);
  const [paying, setPaying] = useState<DistributorDto | null>(null);
  const [deleting, setDeleting] = useState<DistributorDto | null>(null);
  // Deleting erases a distributor's history, so only Admin is offered it; the Accountant adds and edits but never deletes.
  const isAdmin = useSession().user?.role === 'ADMIN';
  const { year } = useFinancialYear();
  const today = istDate();
  const fy = financialYearRange(year ?? financialYearOf(today));
  const collected = useDistributorPaymentTotals(paymentRange('month', today, fy)).data;
  const collectedYear = useDistributorPaymentTotals(paymentRange('year', today, fy)).data;
  const outstanding = useDistributorOutstanding().data;
  const balances = useDistributorBalances().data;
  const updateDistributor = useUpdateDistributor(() => setToggling(null));

  const distributors = useDistributors({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as MasterStatus }),
    ...(values.routeId && { routeId: values.routeId }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.zoneId && { zoneId: values.zoneId }),
    ...(values.assignedUserId && { assignedUserId: values.assignedUserId }),
  });

  const sum = (m: Map<string, number> | undefined) =>
    m && [...m.values()].reduce((n, v) => n + v, 0);

  const columns: readonly Column<DistributorDto>[] = [
    {
      key: 'name',
      header: 'Distributor',
      render: (d) => (
        <div>
          {/* A real link stays in the row for the keyboard and middle-click; the click anywhere on the row opens it too. */}
          <Link href={`/distributors/${d.id}`} className="font-medium text-text">
            {d.name}
          </Link>
          <div className="text-xs text-text-subtle tabular-nums">{d.gstNumber}</div>
        </div>
      ),
    },
    {
      key: 'coverage',
      header: 'Coverage',
      render: (d) =>
        routesText([
          ...d.zoneIds.map((z) => `${directory.zoneName(z)} (all)`),
          ...d.hqIds.map((q) => `${directory.hqName(q)} (all)`),
          ...d.routeIds.map((r) => directory.routeLabel(r)),
        ]),
    },
    {
      key: 'people',
      header: 'Assigned',
      numeric: true,
      render: (d) =>
        d.assignedUserIds.length === 0 ? (
          <span className="text-text-subtle">Nobody</span>
        ) : (
          d.assignedUserIds.length
        ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (d) =>
        d.location ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Not set</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <Badge tone={d.status === 'active' ? 'success' : 'neutral'}>
          {d.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'collected',
      header: 'Collected this month',
      numeric: true,
      render: (d) => {
        const paise = collected?.get(d.id);
        return paise ? money(paise) : <span className="text-text-subtle">—</span>;
      },
    },
    {
      key: 'dues',
      header: 'Dues',
      numeric: true,
      render: (d) => {
        if (!balances) return <span className="text-text-subtle">—</span>;
        const b = balances.get(d.id);
        const dues = d.openingDuesPaise + (b?.deliveredPaise ?? 0) - (b?.collectedPaise ?? 0);
        return dues === 0 ? <span className="text-text-subtle">—</span> : <span className={dues > 0 ? 'font-medium' : 'text-success-fg'}>{money(dues)}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'whitespace-nowrap text-right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={readOnly || d.status === 'inactive'}
            title={
              readOnly
                ? 'A past financial year is read-only'
                : d.status === 'inactive'
                  ? 'Reactivate the distributor first'
                  : undefined
            }
            onClick={() => setPaying(d)}
          >
            Payment
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/distributors/${d.id}`)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
            className={d.status === 'active' ? 'text-danger-fg hover:text-danger-fg' : undefined}
            onClick={() => setToggling(d)}
          >
            {d.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </Button>
          {isAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={readOnly}
              title={readOnly ? 'A past financial year is read-only' : undefined}
              className="text-danger-fg hover:text-danger-fg"
              onClick={() => setDeleting(d)}
            >
              Delete…
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PagedListFrame
      title="Distributors"
      description="Stockists on one or more routes, with any field employees assigned. Orders, payments and monthly stock are kept against them."
      noun="distributor"
      readOnly={readOnly}
      onNew={() => router.push('/distributors/new')}
      onRowClick={(d) => router.push(`/distributors/${d.id}`)}
      toolbarActions={
        <DistributorTotals month={sum(collected)} year={sum(collectedYear)} dues={outstanding?.duesPaise} />
      }
      filters={
        <>
          <Input
            placeholder="Search by name"
            aria-label="Search distributors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="w-44">
            <Select
              aria-label="Zone"
              value={values.zoneId || ANY}
              options={[{ value: ANY, label: 'All zones' }, ...directory.zoneOptions]}
              onValueChange={(v) => update({ zoneId: v === ANY ? '' : v })}
            />
          </div>
          <div className="w-52">
            <Select
              aria-label="HQ"
              value={values.hqId || ANY}
              options={[{ value: ANY, label: 'All HQs' }, ...directory.hqOptions]}
              onValueChange={(v) => update({ hqId: v === ANY ? '' : v })}
            />
          </div>
          <RouteFilter value={values.routeId} onChange={(v) => update({ routeId: v })} />
          <EmployeeFilter
            allLabel="Anyone assigned"
            value={values.assignedUserId}
            onChange={(v) => update({ assignedUserId: v })}
          />
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={distributors}
      columns={columns}
      emptyDescription="No distributor matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {paying ? (
        <RecordPaymentDialog distributorId={paying.id} onClose={() => setPaying(null)} />
      ) : null}
      <DeleteDistributorDialog distributor={deleting} onClose={() => setDeleting(null)} />
      <StatusToggleDialog
        item={toggling}
        noun="distributor"
        pending={updateDistributor.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) =>
          toggling && updateDistributor.mutate({ id: toggling.id, body: { status } })
        }
      />
    </PagedListFrame>
  );
}
