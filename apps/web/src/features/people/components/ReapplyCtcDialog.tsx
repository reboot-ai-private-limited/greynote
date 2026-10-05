'use client';

import type { ReapplyOutcomeDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { istMonth } from '@/lib/dates';
import { useReapplyCtc } from '../hooks/useCtc';

/**
 * After the formula changes: save a fresh CTC revision for every employee who has one, from a chosen month — same CTC and
 * same hand-edited lines, the current formula. Each employee is independent; the result says who was skipped and why.
 */
export function ReapplyCtcDialog({ onClose }: { onClose: () => void }) {
  const [month, setMonth] = useState(istMonth());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ReapplyOutcomeDto[] | null>(null);
  const reapply = useReapplyCtc(setResult);

  if (result) {
    const revised = result.filter((o) => o.outcome === 'revised').length;
    const skipped = result.filter((o): o is Extract<ReapplyOutcomeDto, { outcome: 'skipped' }> => o.outcome === 'skipped');
    const reasons = [...new Set(skipped.map((s) => s.message))];
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()} title="Formula re-applied" footer={<Button onClick={onClose}>Done</Button>}>
        <p className="text-sm">
          {revised} employee{revised === 1 ? '' : 's'} got a new CTC revision from {month}.
          {skipped.length > 0 ? ` ${skipped.length} skipped.` : ''}
        </p>
        {reasons.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
      </Dialog>
    );
  }

  function submit() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return setError('Choose the month it starts.');
    if (reason.trim().length > 200) return setError('Keep the reason to 200 characters.');
    setError(undefined);
    reapply.mutate({ effectiveFrom: month, ...(reason.trim() ? { reason: reason.trim() } : {}) });
  }

  return (
    <FormDialog
      title="Re-apply the formula to employees"
      description="Saves a new CTC revision for every employee who has one, using the formula as it is now. Earlier revisions and finalized payroll are not changed."
      formId="reapply-ctc-form"
      pending={reapply.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Starts from" htmlFor="reapply-month" error={error}>
        <Input id="reapply-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      <FormField label="Reason (optional)" htmlFor="reapply-reason">
        <Input id="reapply-reason" value={reason} placeholder="Formula re-applied" onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
