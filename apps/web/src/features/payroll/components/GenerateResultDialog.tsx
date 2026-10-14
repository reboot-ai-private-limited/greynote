'use client';

import type { GenerateOutcomeDto } from '@greynote/contracts';
import { PayrollWarnings } from './PayrollWarnings';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { usePayrollWarnings } from '../hooks/usePayroll';
import { generateMessage, needsAttention, skipLabel, summariseGenerate } from '../lib/payroll';

/** What generating did, per employee. A skipped line names the employee and says why. */
export function GenerateResultDialog({ outcomes, month, onClose }: { outcomes: readonly GenerateOutcomeDto[]; month: string; onClose: () => void }) {
  const warnings = usePayrollWarnings(month, true);
  const summary = summariseGenerate(outcomes);
  const attention = needsAttention(summary);
  const finalized = summary.skipped.length - attention.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={generateMessage(summary)}
      description={attention.length > 0 ? 'These could not be generated. Fix the cause and generate again.' : undefined}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {attention.length > 0 ? (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {attention.map((o) => (
            <li key={o.userId} className="px-3 py-2">
              <p className="text-sm font-medium text-text">
                {o.userName || 'Unknown'} <span className="font-normal text-text-subtle">· {o.employeeCode} · {skipLabel(o.reason)}</span>
              </p>
              <p className="text-[13px] text-danger-fg">{o.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <PayrollWarnings warnings={warnings.data} className="mt-3" />
      {finalized > 0 ? (
        <p className="mt-3 text-[13px] text-text-subtle">
          {finalized} already finalized {finalized === 1 ? 'was' : 'were'} left as they are.
        </p>
      ) : null}
    </Dialog>
  );
}
