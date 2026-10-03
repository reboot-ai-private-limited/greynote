'use client';

import type { LeaveBalanceDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { useAdjustBalance } from '../hooks/useBalances';
import { adjustPreview, adjustReasonError, allocationError, allocationFloor, REASON_MAX } from '../lib/balances';
import { formatDays } from '../lib/days';

/** Set this employee's allocation for a type and year. A reason is required and kept; it cannot go below used plus pending. */
export function AdjustBalanceDialog({ balance, onClose }: { balance: LeaveBalanceDto; onClose: () => void }) {
  const [allocated, setAllocated] = useState(formatDays(balance.allocatedDays));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ allocated?: string | undefined; reason?: string | undefined }>({});
  const adjust = useAdjustBalance(balance.userId, balance.leaveTypeId, onClose);
  const floor = allocationFloor(balance);
  const problem = allocationError(allocated, balance);
  const next = problem ? null : Number(allocated.trim());

  function submit() {
    const found = { allocated: allocationError(allocated, balance), reason: adjustReasonError(reason) };
    setErrors(found);
    if (found.allocated || found.reason) return;
    const days = Number(allocated.trim());
    if (days === balance.allocatedDays) return onClose();
    adjust.mutate({ year: balance.year, allocatedDays: days, reason: reason.trim() });
  }

  return (
    <FormDialog
      title={`Adjust ${balance.leaveTypeName}, ${balance.year}–${String(balance.year + 1).slice(2)}`}
      description={`${formatDays(floor)} ${floor === 1 ? 'day is' : 'days are'} already used or waiting for approval, so the allocation can't go lower than that.`}
      formId="adjust-balance-form"
      pending={adjust.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField
        label="Allocated days"
        htmlFor="adjust-allocated"
        error={errors.allocated}
        {...(!errors.allocated && next !== null && next !== balance.allocatedDays ? { hint: adjustPreview(balance.allocatedDays, next) } : {})}
      >
        <Input id="adjust-allocated" inputMode="decimal" value={allocated} onChange={(e) => setAllocated(e.target.value)} aria-invalid={errors.allocated ? true : undefined} />
      </FormField>
      <FormField label="Reason" htmlFor="adjust-reason" error={errors.reason} hint="Required. Kept with the balance, with who and when.">
        <Textarea id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} aria-invalid={errors.reason ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
