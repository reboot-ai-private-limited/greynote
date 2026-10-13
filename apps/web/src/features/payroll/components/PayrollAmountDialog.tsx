'use client';

import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { rupeesToPaise } from '@/lib/money';
import { useAdjustAmount } from '../hooks/usePayroll';

/** HR adds an amount to a draft's net, or takes one off (a bonus, an advance recovered), with a reason; kept with who and when. */
export function PayrollAmountDialog({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [sign, setSign] = useState<'add' | 'take'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdjustAmount(runId, onClose);

  function submit() {
    const paise = rupeesToPaise(amount);
    const next: Record<string, string> = {};
    if (paise === null || paise === 0) next['amount'] = 'Enter an amount in rupees, more than zero.';
    if (reason.trim() === '') next['reason'] = 'A reason is required.';
    setErrors(next);
    if (Object.keys(next).length > 0 || paise === null) return;
    save.mutate({ amountPaise: sign === 'add' ? paise : -paise, reason: reason.trim() });
  }

  return (
    <FormDialog title="Add or take off an amount" description="It is added to, or taken off, this month's net pay. It is kept with your name, the time and the reason." formId="payroll-amount-form" pending={save.isPending} onClose={onClose} onSubmit={submit}>
      <FormField label="This is" htmlFor="payroll-amount-sign">
        <Select id="payroll-amount-sign" value={sign} onValueChange={(v) => setSign(v as 'add' | 'take')} options={[{ value: 'add', label: 'Added to the net pay' }, { value: 'take', label: 'Taken off the net pay' }]} />
      </FormField>
      <FormField label="Amount (₹)" htmlFor="payroll-amount" {...(errors['amount'] ? { error: errors['amount'] } : {})}>
        <Input id="payroll-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={errors['amount'] ? true : undefined} />
      </FormField>
      <FormField label="Reason" htmlFor="payroll-amount-reason" {...(errors['reason'] ? { error: errors['reason'] } : {})}>
        <Textarea id="payroll-amount-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={errors['reason'] ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
