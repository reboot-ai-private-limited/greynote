'use client';

import type { DistributorDetailDto, DistributorDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { DataState } from '@/components/ui/DataState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDistributorPaymentTotals } from '../hooks/useDistributorPayments';
import { useDistributor, useDistributors } from '../hooks/useDistributors';
import { paymentRange } from '../lib/payments';
import { DistributorOrdersTab } from './DistributorOrdersTab';
import { DistributorPaymentsTab } from './DistributorPaymentsTab';
import { DistributorStockTab } from './DistributorStockTab';
import { RecordPaymentDialog } from './RecordPaymentDialog';

/**
 * The Accountant's view of distributors: who paid what, with the orders and the monthly stock to check it against. The Accountant records
 * and cancels payments and marks orders done, but does not edit a distributor, so there is no Details tab, no add wizard and no territory
 * filters (the territory screens are Admin's).
 */
export function DistributorAccountsScreen() {
  const router = useRouter();
  const { values, page, pageSize, update } = useFilterParams(['search', 'status']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const [paying, setPaying] = useState<DistributorDto | null>(null);
  const { year } = useFinancialYear();
  const today = istDate();
  const collected = useDistributorPaymentTotals(paymentRange('month', today, financialYearRange(year ?? financialYearOf(today)))).data;
  const distributors = useDistributors({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as 'active' | 'inactive' }),
  });

  const columns: readonly Column<DistributorDto>[] = [
    {
      key: 'name',
      header: 'Distributor',
      render: (d) => (
        <div>
          <Link href={`/distributors/${d.id}`} className="font-medium text-text">
            {d.name}
          </Link>
          <div className="text-xs text-text-subtle tabular-nums">{d.gstNumber}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (d) => <Badge tone={d.status === 'active' ? 'success' : 'neutral'}>{d.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'collected',
      header: 'Collected this month',
      numeric: true,
      render: (d) => {
        const paise = collected?.get(d.id);
        return paise ? formatMoney(paise) : <span className="text-text-subtle">—</span>;
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
            title={readOnly ? 'A past financial year is read-only' : d.status === 'inactive' ? 'This distributor is inactive' : undefined}
            onClick={() => setPaying(d)}
          >
            Payment
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/distributors/${d.id}`)}>
            Open
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PagedListFrame
      title="Distributors"
      description="Record what each distributor paid, and check it against their orders and monthly stock."
      noun="distributor"
      readOnly={readOnly}
      onRowClick={(d) => router.push(`/distributors/${d.id}`)}
      filters={
        <>
          <Input placeholder="Search by name" aria-label="Search distributors" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
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
      {paying ? <RecordPaymentDialog distributorId={paying.id} onClose={() => setPaying(null)} /> : null}
    </PagedListFrame>
  );
}

/** One distributor for the Accountant: Payments first, then Orders and Stock (read only). */
export function DistributorAccountsPage({ id }: { id: string }) {
  const query = useDistributor(id);
  return (
    <DataState
      isLoading={query.isLoading}
      error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
      isEmpty={!query.data}
      empty={{ title: 'Distributor not found' }}
      skeleton={
        <div role="status" aria-label="Loading" className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      {query.data ? <AccountsPage distributor={query.data} /> : null}
    </DataState>
  );
}

function AccountsPage({ distributor }: { distributor: DistributorDetailDto }) {
  const inactive = distributor.status === 'inactive';
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/distributors" className="text-text-muted hover:text-accent hover:underline">
          ← Distributors
        </Link>
      </p>
      <PageHeader
        title={distributor.name}
        description={distributor.gstNumber}
        actions={<Badge tone={inactive ? 'neutral' : 'success'}>{inactive ? 'Inactive' : 'Active'}</Badge>}
      />
      <Tabs defaultValue="payments" className="space-y-6">
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="payments">
          <DistributorPaymentsTab distributorId={distributor.id} inactive={inactive} />
        </TabsContent>
        <TabsContent value="orders">
          <DistributorOrdersTab distributorId={distributor.id} />
        </TabsContent>
        <TabsContent value="stock">
          <DistributorStockTab distributorId={distributor.id} inactive={inactive} />
        </TabsContent>
      </Tabs>
    </>
  );
}
