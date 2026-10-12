'use client';

import type { LeaveDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { useAllowLateLeaveApproval } from '../hooks/useLeaves';

const REASON_MAX = 500;

/** Admin lets a leave whose first day has passed be approved, once; it ends after the default time set in Settings. */
export function AllowLateApprovalDialog({
  leave,
  onClose,
}: {
  leave: LeaveDetailDto;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const allow = useAllowLateLeaveApproval(leave.id, onClose);

  function submit() {
    if (reason.trim() === '') return setError('Enter a reason.');
    setError(undefined);
    allow.mutate({ reason: reason.trim() });
  }

  return (
    <FormDialog
      title="Allow a late approval"
      description="This leave has already started, so it can't be approved. Allowing it lets the manager or HR approve it once, within the time set in Settings. Until then it may be rejected automatically."
      formId="allow-late-leave-form"
      pending={allow.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField
        label="Reason"
        htmlFor="allow-late-reason"
        error={error}
        hint="Required. Kept with who allowed it and when."
      >
        <Textarea
          id="allow-late-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX}
          aria-invalid={error ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
