'use client';

import type { ChemistCallDto, DoctorCallDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { useAcceptCall } from '../hooks/usePreviews';
import { OVERRIDE_REASON_MAX, geofenceDetail, overrideReasonError } from '../lib/review';

/**
 * Accept a call the location check flagged. A separate act from approving the day: the reason is kept on the call beside
 * what the check found, with who and when. Mounted only while open.
 */
export function AcceptCallDialog({
  dcrId,
  call,
  onClose,
}: {
  dcrId: string;
  call: DoctorCallDto | ChemistCallDto;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | undefined>();
  const accept = useAcceptCall(dcrId, onClose);
  const name = 'doctorName' in call ? call.doctorName : call.chemistName;

  function submit() {
    const problem = overrideReasonError(comment);
    setError(problem);
    if (!problem) accept.mutate({ callId: call.id, comment });
  }

  return (
    <FormDialog
      title={`Accept the call to ${name || 'this place'}`}
      description={`${geofenceDetail(call.geofence)} Accepting it counts the visit; it does not approve the report.`}
      formId="accept-call-form"
      pending={accept.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Reason" htmlFor="accept-reason" error={error} hint="Required. Kept with the call, beside what the check found.">
        <Textarea
          id="accept-reason"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={OVERRIDE_REASON_MAX}
          aria-invalid={error ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
