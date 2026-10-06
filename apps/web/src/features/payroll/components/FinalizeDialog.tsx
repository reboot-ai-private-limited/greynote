'use client';

import type { PayrollRunDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatMoney } from '@/lib/format';
import { useFinalize } from '../hooks/usePayroll';
import { finalizeMessage, monthLabel, runTotals, type FinalizeResult } from '../lib/payroll';

/**
 * Locks drafts. It is a one-way door: a finalized month is a record, and later expense or leave changes do not touch it. So it asks
 * for a deliberate tick, says what is locked and for how much, 
 */
export function FinalizeDialog({
  runs: liveRuns,
  month,
  onClose,
}: {
  runs: readonly PayrollRunDto[];
  month: string;
  onClose: () => void;
}) {
  // The sheet refetches once some are finalized and the drafts shrink; the summary must still say "7 of 9".
  const [runs] = useState(liveRuns);
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<FinalizeResult | null>(null);
  const finalize = useFinalize(setResult);
  const totals = runTotals(runs);
  const single = runs.length === 1 ? runs[0] : undefined;
  const byId = new Map(runs.map((r) => [r.id, r]));

  if (result) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={finalizeMessage(result, runs.length)}
        description={result.failed.length > 0 ? 'These were not finalized and are unchanged.' : undefined}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        {result.failed.length > 0 ? (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {result.failed.map((f) => (
              <li key={f.id} className="px-3 py-2">
                <p className="text-sm font-medium text-text">{byId.get(f.id)?.userName ?? f.id}</p>
                <p className="text-[13px] text-danger-fg">{f.message}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !finalize.isPending && onClose()}
      title={single ? `Finalize ${single.userName}` : `Finalize ${runs.length} drafts`}
      description={`${monthLabel(month)} · ${formatMoney(totals.netPaise)} net payable. This locks ${single ? 'the run' : 'these runs'}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={finalize.isPending}>
            Cancel
          </Button>
          <Button disabled={!checked || finalize.isPending} onClick={() => finalize.mutate(runs.map((r) => r.id))}>
            {finalize.isPending ? 'Working…' : single ? 'Finalize' : 'Finalize all'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-text-muted">
        <p>
          A finalized run cannot be regenerated or changed. Leave approved afterwards does not alter it. TA, DA and reimbursements are not in a salary sheet: they are paid separately.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-text">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 rounded border-border-strong accent-[var(--color-accent)]" />
          <span>I have checked the figures{single ? '' : ' for every employee'} and want to lock {single ? 'this run' : 'these runs'}.</span>
        </label>
      </div>
    </Dialog>
  );
}
