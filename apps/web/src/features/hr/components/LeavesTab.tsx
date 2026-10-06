'use client';

import type { LeaveDetailDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { STATUS_LABEL, STATUS_TONE } from '@/features/approvals/lib/approvals';
import { EmployeeFilter, EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useAllLeaves } from '../hooks/useLeaves';
import { daysLabel, leaveRangeLabel } from '../lib/leave';

/**
 * Everyone's leaves, read-only. Deciding one happens in Approvals, so a row opens its approval rather than offering a second
 * place to approve.
 */
export function LeavesTab() {
  const { values, page, update } = useFilterParams(['userId', 'from', 'to']);
  // A range is optional here (the API fills in the selected financial year); only a reversed one is held back.
  const range = values.from && values.to && values.from > values.to ? 'The end date is before the start date.' : undefined;
  const list = useAllLeaves({
    page,
    ...(values.userId && { userId: values.userId }),
    ...(!range && values.from && { from: values.from }),
    ...(!range && values.to && { to: values.to }),
  });

  const columns: readonly Column<LeaveDetailDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (l) => (
        <span className="font-medium">
          <EmployeeName userId={l.userId} />
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (l) => (
        <span className="inline-flex items-center gap-2">
          {l.leaveTypeName}
          {l.isPaid ? null : <Badge tone="warning">Unpaid</Badge>}
          {l.attachments.length > 0 ? <Badge tone="neutral">{l.attachments.length === 1 ? '1 file' : `${l.attachments.length} files`}</Badge> : null}
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (l) => (
        <div>
          <div>{leaveRangeLabel(l.startDate, l.endDate, l.half)}</div>
          <div className="text-xs text-text-subtle">{daysLabel(l.daysCount)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => {
        const status = l.status as keyof typeof STATUS_LABEL;
        return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{STATUS_LABEL[status] ?? l.status}</Badge>;
      },
    },
    {
      key: 'open',
      header: '',
      className: 'w-24 text-right',
      render: (l) =>
        l.approval ? (
          <Link href={`/approvals/${l.approval.requestId}`} className="text-sm text-accent hover:underline">
            Open
          </Link>
        ) : null,
    },
  ];

  return (
    <PagedListFrame
      title="Leaves"
      description="Everyone's leave requests, newest first. Open one to see its history and decide it."
      noun="leave"
      readOnly={false}
      hideHeader
      filters={
        <>
          <EmployeeFilter allLabel="Any employee" value={values.userId} onChange={(v) => update({ userId: v })} />
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <label htmlFor="leaves-from">Leaves between</label>
            <Input id="leaves-from" type="date" value={values.from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
            <label htmlFor="leaves-to">and</label>
            <Input id="leaves-to" type="date" value={values.to} onChange={(e) => update({ to: e.target.value })} className="w-40" aria-invalid={range ? true : undefined} />
          </div>
          {values.userId || values.from || values.to ? (
            <Button variant="ghost" size="sm" onClick={() => update({ userId: '', from: '', to: '' })}>
              Clear filters
            </Button>
          ) : null}
          {range ? (
            <p role="alert" className="basis-full text-[13px] text-danger-fg">
              {range}
            </p>
          ) : null}
        </>
      }
      query={list}
      columns={columns}
      emptyTitle="No leaves"
      emptyDescription="No leave matches these filters."
      onPageChange={(p) => update({ page: p })}
    />
  );
}
