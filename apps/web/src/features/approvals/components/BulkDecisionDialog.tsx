'use client';

import type { ApprovalInboxItemDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { useSession } from '@/lib/auth/SessionProvider';
import { useBulkDecision } from '../hooks/useApprovals';
import { bulkMessage, kindLabel, reasonError, skipsManager, summariseBulk, type BulkSummary } from '../lib/approvals';

/**
 * Decide several requests at once. Each is sent at the round it was showing, so one that was resubmitted since
 * fails alone. The result lists every failure by name, because "7 of 9 done" is not enough to know what to do.
 */
export function BulkDecisionDialog({
  decision,
  rows: liveRows,
  onClose,
  onFinished,
}: {
  decision: 'APPROVE' | 'REJECT';
  rows: readonly ApprovalInboxItemDto[];
  onClose: () => void;
  /** The ids that were decided, so the screen can drop them from its selection. */
  onFinished: (decidedIds: string[]) => void;
}) {
  const role = useSession().user?.role;
  // The queue refetches once some are decided and the selection shrinks; the summary must still say "7 of 9".
  const [rows] = useState(liveRows);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const bulk = useBulkDecision((results) => {
    const result = summariseBulk(results);
    setSummary(result);
    const failedIds = new Set(result.failed.map((f) => f.requestId));
    onFinished(rows.filter((r) => !failedIds.has(r.id)).map((r) => r.id));
  });
  const rejecting = decision === 'REJECT';
  const skipped = !rejecting && rows.filter((r) => skipsManager(r, role)).length;
  const byId = new Map(rows.map((r) => [r.id, r]));

  function submit() {
    const problem = reasonError(comment, rejecting);
    setError(problem);
    if (!problem) bulk.mutate({ decision, rows: [...rows], comment });
  }

  if (summary) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={bulkMessage(summary, rows.length)}
        description={summary.failed.length > 0 ? 'These were not decided. They are still in the queue.' : undefined}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        {summary.failed.length > 0 ? (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {summary.failed.map((f) => {
              const row = byId.get(f.requestId);
              return (
                <li key={f.requestId} className="px-3 py-2">
                  <p className="text-sm font-medium text-text">
                    {row ? `${kindLabel(row.kind)} · ${row.submitter?.name ?? 'Unknown'}` : f.requestId}
                  </p>
                  <p className="text-[13px] text-danger-fg">{f.message}</p>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${rejecting ? 'Reject' : 'Approve'} ${rows.length} request${rows.length === 1 ? '' : 's'}`}
      description={
        skipped
          ? `${skipped} of these ${skipped === 1 ? 'is' : 'are'} still waiting on the manager. Approving decides ${skipped === 1 ? 'it' : 'them'} at once, without the manager.`
          : rejecting
            ? 'Each employee sees the reason and can fix the request and send it again.'
            : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={bulk.isPending}>
            Cancel
          </Button>
          <Button variant={rejecting ? 'danger' : 'primary'} disabled={bulk.isPending} onClick={submit}>
            {bulk.isPending ? 'Working…' : rejecting ? 'Reject all' : 'Approve all'}
          </Button>
        </>
      }
    >
      <FormField
        label={rejecting ? 'Reason' : 'Comment'}
        htmlFor="bulk-comment"
        error={error}
        hint={rejecting ? 'Required. The same reason goes to every request.' : 'Optional. Added to every request.'}
      >
        <Textarea id="bulk-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-invalid={error ? true : undefined} />
      </FormField>
    </Dialog>
  );
}
