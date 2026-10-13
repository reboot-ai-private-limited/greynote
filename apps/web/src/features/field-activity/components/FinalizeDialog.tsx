'use client';

import type { FinalizeOutcomeDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useFinalizeExpenses } from '../hooks/useExpenses';

/**
 * Finalizing closes the month: HR can no longer change its amounts, it cannot be reopened, and it can be paid. It is asked for once for one
 * employee, or for every approved month at once; each is closed on its own, so one that cannot be does not stop the others.
 */
export function FinalizeDialog({
  month,
  userIds,
  count,
  name,
  onClose,
  onDone,
}: {
  month: string;
  /** The employees to finalize; omitted for every approved month. */
  userIds?: string[];
  count: number;
  name?: string;
  onClose: () => void;
  onDone: (outcomes: FinalizeOutcomeDto[]) => void;
}) {
  const finalize = useFinalizeExpenses((outcomes) => {
    onClose();
    onDone(outcomes);
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={name ? `Finalize ${name}'s ${monthLabel(month)}?` : `Finalize ${count} approved ${count === 1 ? 'month' : 'months'}?`}
      description="This locks the amounts and makes the month payable. It cannot be undone here."
      footer={
        <>
          <Button variant="secondary" disabled={finalize.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={finalize.isPending} onClick={() => finalize.mutate({ month, ...(userIds ? { userIds } : {}) })}>
            {finalize.isPending ? 'Working…' : 'Finalize'}
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
        <li>HR can no longer change this month's amounts, or add to it.</li>
        <li>It can no longer be sent back or reopened.</li>
        <li>Only a finalized month can be paid.</li>
      </ul>
    </Dialog>
  );
}
