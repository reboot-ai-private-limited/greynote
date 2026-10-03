'use client';

import type { ApprovalInboxItemDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { toErrorState } from '@/lib/api/toErrorState';
import { ageLabel } from '@/lib/dates';
import { longestWaiting } from '@/lib/dashboard';
import { useApprovalInbox } from '../hooks/useDashboardData';

const KIND_LABEL: Record<string, string> = { LEAVE: 'Leave', DCR: 'Daily report' };

/** The requests that have waited longest, so the first thing on the page is what to do first. */
export function ApprovalsWaitingList({ kind, title }: { kind?: string; title: string }) {
  const inbox = useApprovalInbox(kind);
  const rows: ApprovalInboxItemDto[] = inbox.data ? longestWaiting(inbox.data.items, (i) => i.submittedAt, 5) : [];

  return (
    <Card title={title} description="Longest waiting first">
      <DataState
        isLoading={inbox.isLoading}
        error={inbox.error ? toErrorState(inbox.error, () => void inbox.refetch()) : null}
        isEmpty={rows.length === 0}
        empty={{ title: 'Nothing waiting', description: 'New requests appear here as they are submitted.' }}
      >
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{row.submitter?.name ?? 'Unknown employee'}</p>
                <p className="text-[13px] text-text-subtle">
                  {KIND_LABEL[row.kind] ?? row.kind} · {row.submitter?.employeeCode ?? '—'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge tone="warning">{row.status === 'MANAGER_APPROVED' ? 'Manager approved' : 'Submitted'}</Badge>
                <span className="w-10 text-right text-[13px] tabular-nums text-text-subtle">
                  {ageLabel(row.submittedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </DataState>
    </Card>
  );
}
