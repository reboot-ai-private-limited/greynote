'use client';

import { Badge } from '@/components/ui/Badge';
import { Field, FieldList } from '@/components/ui/FieldList';
import { useLeave, useLeaveBalances } from '../hooks/usePreviews';
import { daysLabel, leaveRangeLabel } from '@/features/hr/lib/leave';
import { balanceForLeave, balanceNote } from '../lib/previews';
import { PreviewFrame } from './PreviewFrame';

/** A leave: what, when, how many days it counts, and what it does to the balance. */
export function LeavePreview({ recordId }: { recordId: string }) {
  const query = useLeave(recordId);
  const leave = query.data;
  const balances = useLeaveBalances(leave?.userId, leave?.year);
  const balance = leave && balances.data ? balanceForLeave(balances.data.balances, leave) : null;
  const range = leave ? leaveRangeLabel(leave.startDate, leave.endDate, leave.half) : '';

  return (
    <PreviewFrame title="Leave" description="Check the dates and the balance before deciding." query={query}>
      {leave ? (
        <div className="space-y-5 p-5">
          <FieldList>
            <Field label="Type">
              <span className="inline-flex items-center gap-2">
                {leave.leaveTypeName}
                <Badge tone={leave.isPaid ? 'success' : 'warning'}>{leave.isPaid ? 'Paid' : 'Unpaid'}</Badge>
              </span>
            </Field>
            <Field label="Dates">{range}</Field>
            <Field label="Counts as">{daysLabel(leave.daysCount)}</Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Reason">{leave.reason}</Field>
            </div>
          </FieldList>
          <p className="text-[13px] text-text-subtle">Weekly off days and holidays inside the dates are not counted.</p>

          <div className="rounded-md border border-border bg-surface-subtle p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">Balance · {leave.leaveTypeName}, {leave.year}</p>
            {leave.isPaid && balance ? (
              <dl className="mt-2 grid grid-cols-4 gap-3 text-sm">
                <div><dt className="text-text-subtle">Allocated</dt><dd className="font-medium tabular-nums">{balance.allocatedDays}</dd></div>
                <div><dt className="text-text-subtle">Used</dt><dd className="font-medium tabular-nums">{balance.usedDays}</dd></div>
                <div><dt className="text-text-subtle">Pending</dt><dd className="font-medium tabular-nums">{balance.pendingDays}</dd></div>
                <div><dt className="text-text-subtle">Available</dt><dd className="font-medium tabular-nums">{balance.availableDays}</dd></div>
              </dl>
            ) : null}
            <p className="mt-2 text-sm text-text-muted">
              {balances.isLoading && leave.isPaid ? 'Loading the balance…' : balances.error && leave.isPaid ? 'The balance could not be loaded.' : balanceNote(leave, balance)}
            </p>
          </div>
        </div>
      ) : null}
    </PreviewFrame>
  );
}
