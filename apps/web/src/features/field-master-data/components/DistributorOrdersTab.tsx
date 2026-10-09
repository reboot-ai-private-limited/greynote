'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { toErrorState } from '@/lib/api/toErrorState';
import type { DistributorOrderRow } from '@/lib/api/endpoints/sales';
import { rangeError } from '@/lib/dateRange';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useDistributorOrders } from '../hooks/useDistributorPayments';
import { PAYMENT_RANGE_OPTIONS, paymentRange, type PaymentRange } from '../lib/payments';

const TONE = { PLACED: 'warning', DONE: 'success', CANCELLED: 'neutral' } as const;

/** The orders placed for this distributor in a range, whoever placed them. Placing and finishing orders stays on the phone and the Orders report. */
export function DistributorOrdersTab({ distributorId }: { distributorId: string }) {
  const today = istDate();
  const { year } = useFinancialYear();
  const fy = financialYearRange(year ?? financialYearOf(today));
  const [preset, setPreset] = useState<PaymentRange>('month');
  const [custom, setCustom] = useState({ from: fy.from, to: fy.to < today ? fy.to : today });
  const range = preset === 'custom' ? custom : paymentRange(preset, today, fy);
  const problem = preset === 'custom' ? rangeError(range.from, range.to) : undefined;
  const query = useDistributorOrders({ distributorId, ...range }, !problem);
  const rows = query.data ?? [];

  const columns: readonly Column<DistributorOrderRow>[] = [
    { key: 'date', header: 'Date', render: (o) => o.orderDate },
    { key: 'by', header: 'Placed by', render: (o) => <EmployeeName userId={o.userId} /> },
    { key: 'lines', header: 'Lines', numeric: true, render: (o) => o.items.length },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (o) => <span className="font-medium">{formatMoney(o.totalAmountPaise)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <Badge tone={TONE[o.status]}>
          {o.status === 'PLACED' ? 'Placed' : o.status === 'DONE' ? 'Done' : 'Cancelled'}
        </Badge>
      ),
    },
    { key: 'remarks', header: 'Remarks', render: (o) => o.remarks ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          value={{ preset, from: range.from, to: range.to }}
          presets={PAYMENT_RANGE_OPTIONS}
          max={fy.to}
          error={problem}
          onChange={(next) => {
            if (next.preset !== undefined) setPreset(next.preset as PaymentRange);
            if (next.from !== undefined || next.to !== undefined)
              setCustom((c) => ({ from: next.from ?? c.from, to: next.to ?? c.to }));
          }}
        />
        <Link href="/orders" className="text-sm text-accent hover:underline">
          All orders
        </Link>
      </div>
      <DataState
        isLoading={!problem && query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!problem && !!query.data && rows.length === 0}
        empty={{ title: 'No orders in this period' }}
      >
        <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} bleed={false} />
      </DataState>
    </div>
  );
}
