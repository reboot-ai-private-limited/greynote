'use client';

import type { ReportOrderRowDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { monthsInYear } from '@/features/attendance/lib/attendance';
import { EmployeeFilter } from '@/features/people/components/EmployeePickerField';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useFinishOrder, useOrdersReport } from '../hooks/useOrders';
import {
  OPTIONS_STATUS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TABS,
  canFinish,
  ordersCsv,
  ordersFilename,
  tabOf,
} from '../lib/orders';
import { OrderDetailDialog } from './OrderDetailDialog';
import { AddOrderDialog } from './OrderFormDialog';

const ANY = 'all';

/**
 * Orders for the financial year in view, a month at a time (Admin). An order to a distributor is a primary sale once it is Done; a chemist
 * order is information only. Admin can mark a placed distributor order Done or Cancelled, as the API already allows.
 */
export function OrdersScreen() {
  const readOnly = useIsReadOnly();
  const { values, update } = useFilterParams(['month', 'tab', 'status', 'mrId']);
  const { year } = useFinancialYear();
  const today = istDate();
  const months = monthsInYear(year ?? financialYearOf(today), today);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const tab = tabOf(values.tab);
  const status =
    values.status === 'PLACED' || values.status === 'DONE' || values.status === 'CANCELLED'
      ? values.status
      : undefined;

  const query = useOrdersReport(
    { month, type: tab, ...(status && { status }), ...(values.mrId && { mrId: values.mrId }) },
    month !== '',
  );
  const report = query.data;
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState<{
    row: ReportOrderRowDto;
    to: 'DONE' | 'CANCELLED';
  } | null>(null);
  const done = useFinishOrder('DONE', () => setFinishing(null));
  const cancel = useFinishOrder('CANCELLED', () => setFinishing(null));
  const finish = finishing?.to === 'DONE' ? done : cancel;

  const columns: readonly Column<ReportOrderRowDto>[] = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.orderDate) },
    {
      key: 'outlet',
      header: tab === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist',
      render: (r) => <span className="font-medium">{r.outlet.name}</span>,
    },
    { key: 'mr', header: 'MR', render: (r) => `${r.mr.name} · ${r.mr.employeeCode}` },
    { key: 'items', header: 'Items', numeric: true, render: (r) => r.itemCount },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (r) => formatMoney(r.totalAmountPaise),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={ORDER_STATUS_TONE[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(r.id)}
            aria-label={`Open the order of ${r.outlet.name} on ${r.orderDate}`}
          >
            Open
          </Button>
          {canFinish(r) ? (
            <>
              <Button
                size="sm"
                disabled={readOnly}
                onClick={() => setFinishing({ row: r, to: 'DONE' })}
              >
                Done
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={readOnly}
                onClick={() => setFinishing({ row: r, to: 'CANCELLED' })}
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const note = ORDER_TABS.find((t) => t.value === tab)!.note;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders by the day they were placed, a month at a time for the financial year in view."
        actions={
          <>
            <Button variant="secondary" disabled={readOnly} onClick={() => setAdding(true)}>
              Add order
            </Button>
            <Button
              variant="secondary"
              disabled={!report || report.rows.length === 0}
              onClick={() => report && downloadCsv(ordersFilename(month, tab), ordersCsv(report))}
            >
              Download CSV
            </Button>
          </>
        }
      />
      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">
            No month of this financial year has started yet.
          </p>
        </Card>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => update({ tab: v })}>
            <TabsList>
              {ORDER_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="mt-3 text-[13px] text-text-subtle">{note}</p>

          <div className="my-4 flex flex-wrap items-center gap-3">
            <div className="w-52">
              <Select
                aria-label="Month"
                value={month}
                options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
                onValueChange={(v) => update({ month: v })}
              />
            </div>
            <div className="w-40">
              <Select
                aria-label="Status"
                value={status ?? ANY}
                options={OPTIONS_STATUS}
                onValueChange={(v) => update({ status: v === ANY ? '' : v })}
              />
            </div>
            <EmployeeFilter
              allLabel="Any MR"
              value={values.mrId}
              onChange={(v) => update({ mrId: v })}
            />
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile
              label={tab === 'DISTRIBUTOR' ? 'Done (primary)' : 'Done'}
              value={formatMoney(report?.totals.done.amountPaise ?? 0)}
              note={`${report?.totals.done.count ?? 0} orders`}
              tone="success"
            />
            <StatTile
              label="Placed, not yet done"
              value={formatMoney(report?.totals.placed.amountPaise ?? 0)}
              note={`${report?.totals.placed.count ?? 0} orders`}
              tone="warning"
            />
            <StatTile
              label="Cancelled"
              value={`${report?.totals.cancelled.count ?? 0}`}
              note="never counted"
            />
          </div>

          <Card flat>
            <DataState
              isLoading={query.isLoading}
              error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
              isEmpty={!report || report.rows.length === 0}
              empty={{
                title: `No orders in ${monthLabel(month)}`,
                description: 'Orders appear here as MRs place them.',
              }}
            >
              <DataTable columns={columns} rows={report?.rows ?? []} rowKey={(r) => r.id} />
            </DataState>
          </Card>
          {report?.truncated ? (
            <p
              role="status"
              className="mt-3 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg"
            >
              This month has more orders than the list holds, so the oldest are missing and the
              totals are short. Narrow it by status or MR.
            </p>
          ) : null}
        </>
      )}

      {adding ? <AddOrderDialog onClose={() => setAdding(false)} /> : null}
      {open ? <OrderDetailDialog id={open} onClose={() => setOpen(null)} /> : null}
      <ConfirmDialog
        open={finishing !== null}
        onOpenChange={(o) => !o && setFinishing(null)}
        title={finishing?.to === 'DONE' ? 'Mark this order Done?' : 'Cancel this order?'}
        description={
          finishing
            ? finishing.to === 'DONE'
              ? `${finishing.row.outlet.name}, ${formatMoney(finishing.row.totalAmountPaise)}. It then counts as a primary sale, and this cannot be undone.`
              : `${finishing.row.outlet.name}, ${formatMoney(finishing.row.totalAmountPaise)}. A cancelled order is never counted, and this cannot be undone.`
            : undefined
        }
        confirmLabel={finishing?.to === 'DONE' ? 'Mark Done' : 'Cancel the order'}
        tone={finishing?.to === 'DONE' ? 'primary' : 'danger'}
        pending={finish.isPending}
        onConfirm={() => finishing && finish.mutate(finishing.row.id)}
      />
    </>
  );
}
