'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { InvoiceRowDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, invoiceTotals } from '@/features/invoices/lib/invoices';
import { toErrorState } from '@/lib/api/toErrorState';
import { rangeError } from '@/lib/dateRange';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatDate, formatMoney } from '@/lib/format';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { PAYMENT_RANGE_OPTIONS, paymentRange, type PaymentRange } from '../lib/payments';

/** This distributor's invoices (Done orders with an invoice number) for orders placed in a range: total, paid, due. Each opens as the printable invoice. */
export function DistributorInvoicesTab({ distributorId }: { distributorId: string }) {
  const today = istDate();
  const { year } = useFinancialYear();
  const fy = financialYearRange(year ?? financialYearOf(today));
  const [preset, setPreset] = useState<PaymentRange>('year');
  const [custom, setCustom] = useState({ from: fy.from, to: fy.to < today ? fy.to : today });
  const range = preset === 'custom' ? custom : paymentRange(preset, today, fy);
  const problem = preset === 'custom' ? rangeError(range.from, range.to) : undefined;
  const query = useInvoices({ distributorId, ...range }, !problem);
  const rows = query.data ?? [];
  const totals = invoiceTotals(rows);

  const columns: readonly Column<InvoiceRowDto>[] = [
    { key: 'number', header: 'Invoice no.', render: (r) => <span className="font-medium">{r.invoiceNumber}</span> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.invoiceDate) },
    { key: 'total', header: 'Total', numeric: true, render: (r) => formatMoney(r.totalPaise) },
    { key: 'paid', header: 'Paid', numeric: true, render: (r) => formatMoney(r.paidPaise) },
    { key: 'due', header: 'Due', numeric: true, render: (r) => <span className={r.duePaise > 0 ? 'font-medium' : 'text-text-subtle'}>{formatMoney(r.duePaise)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={INVOICE_STATUS_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge> },
    {
      key: 'open',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Link href={`/invoices/${r.orderId}`} className="text-sm text-accent hover:underline" aria-label={`Open invoice ${r.invoiceNumber}`}>
          Open
        </Link>
      ),
    },
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
            if (next.from !== undefined || next.to !== undefined) setCustom((c) => ({ from: next.from ?? c.from, to: next.to ?? c.to }));
          }}
        />
        <Link href="/invoices" className="text-sm text-accent hover:underline">
          All invoices
        </Link>
      </div>
      {rows.length > 0 ? (
        <p className="text-sm text-text-muted">
          {rows.length} invoices · Total {formatMoney(totals.totalPaise)} · Paid {formatMoney(totals.paidPaise)} · <span className="font-medium text-text">Due {formatMoney(totals.duePaise)}</span>
        </p>
      ) : null}
      <DataState
        isLoading={!problem && query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!problem && !!query.data && rows.length === 0}
        empty={{ title: 'No invoices in this period', description: 'An invoice appears when the office marks an order Done with its invoice number.' }}
      >
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.orderId} bleed={false} />
      </DataState>
    </div>
  );
}
