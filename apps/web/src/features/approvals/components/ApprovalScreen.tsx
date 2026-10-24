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
import { useSession } from '@/lib/auth/SessionProvider';
import { AmendMonthlyPlanDialog } from './AmendMonthlyPlanDialog';
import { useDeleteMonthlyPlan, useMonthlyPlan } from '../hooks/usePreviews';
import { localToday } from '../lib/plans';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ApprovalPreview } from './ApprovalPreview';
import { DownloadCsvButton } from './DownloadCsvButton';
import { DecisionDialog } from './DecisionDialog';
import { HistoryTimeline } from './HistoryTimeline';

/**
 * Admin or a manager changes a month that is waiting for them (not their own); everything else about the request stays as it is.
 * Admin and HR can also change one that is already approved, from tomorrow on (`approved`).
 */
function EditMonthlyPlanButton({ recordId, disabled, approved }: { recordId: string; disabled: boolean; approved: boolean }) {
  const [open, setOpen] = useState(false);
  const plan = useMonthlyPlan(recordId);
  return (
    <>
      <Button variant="secondary" disabled={disabled || !plan.data} title={disabled ? 'A past financial year is read-only' : undefined} onClick={() => setOpen(true)}>
        Edit plan
      </Button>
      {open && plan.data ? <AmendMonthlyPlanDialog plan={plan.data} approved={approved} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Admin removes a month that hasn't started, for good: the plan, its approval and its unsent daily plans. */
function DeleteMonthlyPlanButton({ recordId, disabled, onDeleted }: { recordId: string; disabled: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const plan = useMonthlyPlan(recordId);
  const remove = useDeleteMonthlyPlan(recordId, onDeleted);
  if (!plan.data || plan.data.planMonth <= localToday().slice(0, 7)) return null;
  return (
    <>
      <Button variant="danger" disabled={disabled} onClick={() => setOpen(true)}>
        Delete plan
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this monthly plan?"
        description="The plan, its approval and its history are removed for good, along with the daily plans written from it. The employee can plan the month again. This can’t be undone."
        confirmLabel="Delete plan"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSettled: () => setOpen(false) })}
      />
    </>
  );
}

export function ApprovalScreen({ id }: { id: string }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const query = useApproval(id);
  const request = query.data;
  const me = useSession().user;
  const [action, setAction] = useState<DecisionAction | null>(null);
  // Back to the tab this request came from, not the default one.
  const queue = request ? `/approvals?kind=${request.kind}` : '/approvals';

  // A month waiting for a decision is editable by whoever decides it; one past the manager, by Admin and HR (days after today only).
  const canEditMonth =
    request?.kind === 'MONTHLY_PLAN' &&
    request.submitter?.id !== me?.id &&
    (request.status === 'SUBMITTED'
      ? request.canAct
      : (request.status === 'MANAGER_APPROVED' || request.status === 'APPROVED') && (me?.role === 'ADMIN' || me?.role === 'HR'));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={queue} className="text-text-muted hover:text-accent hover:underline">
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
                  {request.kind === 'MONTHLY_PLAN' && me?.role === 'ADMIN' ? <DeleteMonthlyPlanButton recordId={request.recordId} disabled={readOnly} onDeleted={() => router.push(queue)} /> : null}
                  <DownloadCsvButton request={request} />
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
                    {canEditMonth ? <EditMonthlyPlanButton recordId={request.recordId} disabled={readOnly} approved={request.status !== 'SUBMITTED'} /> : null}
                    <Button variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAction('reject')}>
                      Reject
                    </Button>
                    <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAction('approve')}>
                      Approve
                    </Button>
                  </>
                ) : (
                  <>
                    {canEditMonth ? <EditMonthlyPlanButton recordId={request.recordId} disabled={readOnly} approved /> : null}
                    <Button variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAction('reopen')}>
                      Reopen
                    </Button>
                  </>
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
                onDone={() => (action === 'reopen' ? setAction(null) : router.push(queue))}
              />
            ) : null}
          </>
        ) : null}
      </DataState>
    </>
  );
}
