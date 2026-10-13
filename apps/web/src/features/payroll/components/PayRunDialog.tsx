'use client';

import type { PayrollRunDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { formatMoney } from '@/lib/format';
import { usePayRun } from '../hooks/usePayroll';
import { monthLabel } from '../lib/payroll';

/** The Accountant marks a finalized run's salary paid, with an optional reference (a transfer id). Once. */
export function PayRunDialog({ run, onClose }: { run: PayrollRunDto; onClose: () => void }) {
  const [reference, setReference] = useState('');
  const pay = usePayRun(run.id, onClose);
  return (
    <FormDialog
      title={`Mark ${run.userName}'s salary paid`}
      description={`${formatMoney(run.netPayablePaise)} for ${monthLabel(run.month)}. It is recorded with your name and the time, and cannot be undone here.`}
      formId="pay-run-form"
      pending={pay.isPending}
      onClose={onClose}
      onSubmit={() => pay.mutate({ reference: reference.trim() || null })}
    >
      <FormField label="Reference (optional)" htmlFor="pay-run-reference" hint="A transfer or cheque number, so the payment can be found later.">
        <Input id="pay-run-reference" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
