'use client';

import type { InvoiceRowDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { monthsInYear } from '@/features/attendance/lib/attendance';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useInvoices } from '../hooks/useInvoices';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_OPTIONS, INVOICE_STATUS_TONE, invoiceTotals, invoicesCsv, invoicesFilename, monthBounds, statusOf } from '../lib/invoices';

const ANY = 'all';

/**
 * Invoices for the financial year in view, a month at a time (by the day the order was placed): each Done distributor order that has an invoice
 * number, with its total (supplied + GST), what payments have been allocated to it, and what is still due. The invoice prints from here.
 */
export function InvoicesScreen() {
  const { values, update } = useFilterParams(['month', 'status']);
  const { year } = useFinancialYear();
  const today = istDate();
  const months = monthsInYear(year ?? financialYearOf(today), today);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const status = statusOf(values.status ?? '');
  const query = useInvoices({ ...(month && monthBounds(month)), ...(status && { status }) }, month !== '');
  const rows = query.data ?? [];
  const totals = invoiceTotals(rows);

  const columns: readonly Column<InvoiceRowDto>[] = [
    { key: 'number', header: 'Invoice no.', render: (r) => <span className="font-medium">{r.invoiceNumber}</span> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.invoiceDate) },
    { key: 'distributor', header: 'Distributor', render: (r) => r.distributor.name },
    { key: 'total', header: 'Total', numeric: true, render: (r) => formatMoney(r.totalPaise) },
    { key: 'paid', header: 'Paid', numeric: true, render: (r) => formatMoney(r.paidPaise) },
    { key: 'due', header: 'Due', numeric: true, render: (r) => <span className={r.duePaise > 0 ? 'font-medium' : 'text-text-subtle'}>{formatMoney(r.duePaise)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={INVOICE_STATUS_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge> },
    {
      key: 'actions',
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
    <>
      <PageHeader
        title="Invoices"
        description="Done distributor orders with their invoice number, a month at a time: the total with GST, what has been paid against each, and what is due."
        actions={
          <Button variant="secondary" disabled={rows.length === 0} onClick={() => downloadCsv(invoicesFilename(month), invoicesCsv(rows))}>
            Download CSV
          </Button>
        }
      />
      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">No month of this financial year has started yet.</p>
        </Card>
      ) : (
        <>
          <div className="my-4 flex flex-wrap items-center gap-3">
            <div className="w-52">
              <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
            </div>
            <div className="w-40">
              <Select aria-label="Status" value={status ?? ANY} options={INVOICE_STATUS_OPTIONS} onValueChange={(v) => update({ status: v === ANY ? '' : v })} />
            </div>
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Invoiced" value={formatMoney(totals.totalPaise)} note={`${rows.length} invoices`} />
            <StatTile label="Paid against them" value={formatMoney(totals.paidPaise)} tone="success" />
            <StatTile label="Due" value={formatMoney(totals.duePaise)} tone="warning" />
          </div>
          <Card flat>
            <DataState
              isLoading={query.isLoading}
              error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
              isEmpty={rows.length === 0}
              empty={{ title: `No invoices in ${monthLabel(month)}`, description: 'An invoice appears here when the office marks a distributor order Done with its invoice number.' }}
            >
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.orderId} />
            </DataState>
          </Card>
        </>
      )}
    </>
  );
}
