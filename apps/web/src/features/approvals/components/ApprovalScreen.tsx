'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDateTime } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useApproval, type DecisionAction } from '../hooks/useApprovals';
import { STATUS_LABEL, STATUS_TONE, isOpen, kindLabel, stageLabel } from '../lib/approvals';
import { ApprovalPreview } from './ApprovalPreview';
import { DecisionDialog } from './DecisionDialog';
import { HistoryTimeline } from './HistoryTimeline';

export function ApprovalScreen({ id }: { id: string }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const query = useApproval(id);
  const request = query.data;
  const [action, setAction] = useState<DecisionAction | null>(null);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/approvals" className="text-text-muted hover:text-accent hover:underline">
          ← Approvals
        </Link>
      </p>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!request}
        empty={{ title: 'Request not found', description: 'It may not exist, or you may not be allowed to see it.' }}
        skeleton={
          <div role="status" aria-label="Loading" className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        }
      >
        {request ? (
          <>
            <PageHeader
              title={kindLabel(request.kind)}
              description={
                request.submitter
                  ? `From ${request.submitter.name} (${request.submitter.employeeCode}) · submitted ${formatDateTime(request.submittedAt)}${request.cycle > 1 ? ` · round ${request.cycle}` : ''}`
                  : `Submitted ${formatDateTime(request.submittedAt)}`
              }
              actions={
                <div className="flex items-center gap-1.5">
                  <Badge tone={STATUS_TONE[request.status]}>{isOpen(request.status) ? stageLabel(request) : STATUS_LABEL[request.status]}</Badge>
                  {request.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                </div>
              }
            />
            {request.canAct || request.canReopen ? (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
                <p className="mr-auto text-sm text-text-muted">
                  {request.canAct ? 'Review the record below, then decide.' : 'This was approved. Reopening lets the employee change it and send it again.'}
                </p>
                {request.canAct ? (
                  <>
                    <Button variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAction('reject')}>
                      Reject
                    </Button>
                    <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAction('approve')}>
                      Approve
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAction('reopen')}>
                    Reopen
                  </Button>
                )}
              </div>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <ApprovalPreview request={request} />
              <Card title="History">
                <div className="p-5">
                  <HistoryTimeline history={request.history} currentCycle={request.cycle} />
                </div>
              </Card>
            </div>
            {action ? (
              <DecisionDialog
                action={action}
                request={request}
                onClose={() => setAction(null)}
                // After a decision, go back to the queue: the next one is the point.
                onDone={() => (action === 'reopen' ? setAction(null) : router.push('/approvals'))}
              />
            ) : null}
          </>
        ) : null}
      </DataState>
    </>
  );
}
