'use client';

import type { ExpenseDayLineDto, ExpenseStatementDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useExpenseMonth } from '../hooks/usePreviews';
import { PreviewFrame } from './PreviewFrame';

const COLUMNS: readonly Column<ExpenseDayLineDto>[] = [
  { key: 'date', header: 'Date', render: (d) => formatDate(d.date) },
  { key: 'ta', header: 'TA', numeric: true, render: (d) => formatMoney(d.taPaise) },
  { key: 'da', header: 'DA', numeric: true, render: (d) => formatMoney(d.daPaise) },
  {
    key: 'other',
    header: 'Other',
    numeric: true,
    render: (d) => (
      <span
        title={d.others
          .map((o) => `${formatMoney(o.amountPaise)}${o.remarks ? ` — ${o.remarks}` : ''}`)
          .join('\n')}
      >
        {formatMoney(d.otherPaise)}
      </span>
    ),
  },
  {
    key: 'total',
    header: 'Total',
    numeric: true,
    render: (d) => <span className="font-medium">{formatMoney(d.totalPaise)}</span>,
  },
];

/** A month of one employee's expenses, date by date: the TA and DA the server computed and the employee's own entries. */
export function ExpenseMonthPreview({ recordId }: { recordId: string }) {
  const query = useExpenseMonth(recordId);
  return (
    <PreviewFrame
      title="Monthly expenses"
      description="Check each date before deciding. Approving makes the month payable."
      query={query}
    >
      {query.data ? <Body statement={query.data} /> : null}
    </PreviewFrame>
  );
}

function Body({ statement }: { statement: ExpenseStatementDto }) {
  const { totals, submittedTotals } = statement;
  const approveLate =
    statement.status === 'SUBMITTED' &&
    new Date() > new Date(statement.deadlines.approveBy) &&
    !statement.exceptions.approveUntil;
  const changed = submittedTotals !== null && submittedTotals.totalPaise !== totals.totalPaise;
  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="font-medium">{monthLabel(statement.month)}</span>
        <span className="text-text-muted">TA {formatMoney(totals.taPaise)}</span>
        <span className="text-text-muted">DA {formatMoney(totals.daPaise)}</span>
        <span className="text-text-muted">Other {formatMoney(totals.otherPaise)}</span>
        <span className="font-medium">Total {formatMoney(totals.totalPaise)}</span>
      </div>
      {changed ? (
        <Badge tone="warning">
          Total was {formatMoney(submittedTotals.totalPaise)} when sent — TA/DA changed since
        </Badge>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>Send by {formatDateTime(statement.deadlines.submitBy)}</span>
        <span>Approve by {formatDateTime(statement.deadlines.approveBy)}</span>
        {approveLate ? (
          <Badge tone="warning">
            Approval deadline passed — Admin must allow it first (Late expenses)
          </Badge>
        ) : null}
        {statement.exceptions.approveUntil ? (
          <Badge tone="success">
            Late approval allowed until {formatDateTime(statement.exceptions.approveUntil)}
          </Badge>
        ) : null}
      </div>
      <DataTable columns={COLUMNS} rows={statement.days} rowKey={(d) => d.date} bleed={false} />
    </div>
  );
}
