'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { useSession } from '@/lib/auth/SessionProvider';
import { useDecision, type DecisionAction } from '../hooks/useApprovals';
import { useDcr } from '../hooks/usePreviews';
import { kindLabel, reasonError, skipsManager } from '../lib/approvals';
import { approveWarnings, flaggedCalls } from '../lib/review';

const COPY: Record<DecisionAction, { title: string; confirm: string; label: string; required: boolean; hint: string }> = {
  approve: { title: 'Approve', confirm: 'Approve', label: 'Comment', required: false, hint: 'Optional. The employee and the manager can see it.' },
  reject: { title: 'Reject', confirm: 'Reject', label: 'Reason', required: true, hint: 'Required. The employee sees it, and can fix the request and send it again.' },
  reopen: { title: 'Reopen for changes', confirm: 'Reopen', label: 'Reason', required: true, hint: 'Required. The approval stays in the history, and the employee can change it and send it again.' },
};

/** Asks for the comment or reason an action needs, then decides. Mounted only while open. */
export function DecisionDialog({
  action,
  request,
  onClose,
  onDone,
}: {
  action: DecisionAction;
  request: ApprovalDetailDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const role = useSession().user?.role;
  const copy = COPY[action];
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | undefined>();
  const decision = useDecision(request.id, action, onDone);
  // A daily report's flagged calls stay unaccepted when the report is approved; say so. Same query as the preview, so no extra request.
  const dcr = useDcr(request.recordId, request.kind === 'DCR' && action === 'approve');
  const warnings =
    action === 'approve'
      ? approveWarnings({ skipsManager: skipsManager(request, role), flagged: dcr.data ? flaggedCalls(dcr.data).length : 0 })
      : [];

  function submit() {
    const problem = reasonError(comment, copy.required);
    setError(problem);
    if (problem) return;
    decision.mutate({ cycle: request.cycle, comment });
  }

  return (
    <FormDialog
      title={`${copy.title}: ${kindLabel(request.kind).toLowerCase()}`}
      {...(warnings.length > 0
        ? { description: warnings.join(' ') }
        : request.submitter
          ? { description: `From ${request.submitter.name} (${request.submitter.employeeCode}).` }
          : {})}
      formId="decision-form"
      pending={decision.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label={copy.label} htmlFor="decision-comment" error={error} hint={copy.hint}>
        <Textarea
          id="decision-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-invalid={error ? true : undefined}
          maxLength={1000}
        />
      </FormField>
    </FormDialog>
  );
}
