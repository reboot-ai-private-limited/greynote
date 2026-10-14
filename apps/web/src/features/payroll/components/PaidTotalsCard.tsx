'use client';

import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatMoney } from '@/lib/format';
import { usePaidTotals } from '../hooks/usePayroll';
import { monthLabel } from '../lib/payroll';
import type { PaidMonthTotalDto } from '@greynote/contracts';

const columns: readonly Column<PaidMonthTotalDto>[] = [
  { key: 'month', header: 'Month', render: (r) => monthLabel(r.month) },
  { key: 'employees', header: 'Employees paid', numeric: true, render: (r) => r.employees },
  { key: 'paid', header: 'Salary paid', numeric: true, render: (r) => formatMoney(r.paidPaise) },
];

/** What the company paid in salary, month by month: the total only, never who got what. */
export function PaidTotalsCard() {
  const totals = usePaidTotals(true).data ?? [];
  const sum = totals.reduce((n, r) => n + r.paidPaise, 0);
  return (
    <Card title="Salary paid" description="The total marked paid in each month of this financial year.">
      {totals.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-text-muted">No salary has been marked paid yet this year.</p>
      ) : (
        <>
          <DataTable columns={columns} rows={totals} rowKey={(r) => r.month} bleed={false} />
          <p className="px-5 py-3 text-right text-[13px] font-medium tabular-nums">Total for the year {formatMoney(sum)}</p>
        </>
      )}
    </Card>
  );
}
