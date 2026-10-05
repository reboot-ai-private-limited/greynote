'use client';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { monthLabel } from '../lib/payroll';

/** Says what generating reads and what it overwrites before it does it. */
export function GenerateDialog({
  month,
  employee,
  pending,
  onConfirm,
  onClose,
}: {
  month: string;
  /** Set to regenerate one employee; omit for every active field employee. */
  employee?: { name: string } | undefined;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !pending && onClose()}
      title={employee ? `Regenerate ${employee.name}` : `Generate ${monthLabel(month)}`}
      description={employee ? 'Recalculates this one draft from the figures as they are now.' : 'Calculates a draft for every active field employee.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Working…' : employee ? 'Regenerate' : 'Generate'}
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-muted">
        <li>The base is each employee's monthly gross from the CTC in force for the month, kept with the run.</li>
        <li>TA, DA and reimbursements are what was marked <strong className="font-medium text-text">paid during {monthLabel(month)}</strong>. Claims accepted but not yet paid are not counted.</li>
        <li>Unpaid leave days are the approved ones in the month. The deduction is unpaid days × base ÷ 30.</li>
        <li>An existing draft is overwritten. A <strong className="font-medium text-text">finalized</strong> run is never changed: it is skipped.</li>
      </ul>
    </Dialog>
  );
}
