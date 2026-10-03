'use client';

import type { ExpenseAuditRowDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { istDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { useMarkPaid } from '../hooks/useExpenses';
import { EXPENSE_TYPE_LABEL, flaggedRows, markPaidMessage, paidInMonthLabel, sumPaise, type MarkPaidResult } from '../lib/expenses';

/**
 * Marks one or several expenses paid. It is the settlement step and there is no undo, so it says what it does: how much, to whom, and
 * which month payroll will count it in. The result names every row that could not be paid.
 */
export function MarkPaidDialog({
  rows: liveRows,
  onClose,
  onFinished,
}: {
  rows: readonly ExpenseAuditRowDto[];
  onClose: () => void;
  /** The ids that were paid, so the screen can drop them from its selection. */
  onFinished: (paidIds: string[]) => void;
}) {
  // The list refetches once some are paid and the selection shrinks; the summary must still say "7 of 9".
  const [rows] = useState(liveRows);
  const [result, setResult] = useState<MarkPaidResult | null>(null);
  const pay = useMarkPaid((r) => {
    setResult(r);
    onFinished(r.paid);
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const flagged = flaggedRows(rows).length;
  const people = new Set(rows.map((r) => r.userId)).size;
  const single = rows.length === 1 ? rows[0] : undefined;

  if (result) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={markPaidMessage(result, rows.length)}
        description={result.failed.length > 0 ? 'These were not paid and are still in the list.' : undefined}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        {result.failed.length > 0 ? (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {result.failed.map((f) => {
              const row = byId.get(f.id);
              return (
                <li key={f.id} className="px-3 py-2">
                  <p className="text-sm font-medium text-text">{row ? `${row.userName} · ${EXPENSE_TYPE_LABEL[row.type]} · ${formatMoney(row.amountPaise)}` : f.id}</p>
                  <p className="text-[13px] text-danger-fg">{f.message}</p>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={single ? `Mark ${formatMoney(single.amountPaise)} paid` : `Mark ${rows.length} expenses paid`}
      description={
        single
          ? `${EXPENSE_TYPE_LABEL[single.type]} for ${single.userName}. This cannot be undone here.`
          : `${formatMoney(sumPaise(rows))} across ${people} ${people === 1 ? 'employee' : 'employees'}. This cannot be undone here.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pay.isPending}>
            Cancel
          </Button>
          <Button disabled={pay.isPending} onClick={() => pay.mutate(rows.map((r) => r.id))}>
            {pay.isPending ? 'Working…' : single ? 'Mark paid' : 'Mark all paid'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-text-muted">
        <p>Payroll counts a payment in the month it is marked paid. Paid today, this goes into {paidInMonthLabel(istDate())}.</p>
        {flagged > 0 ? (
          <p role="alert" className="rounded-md border border-warning bg-warning-bg p-3 text-warning-fg">
            {flagged === 1 ? '1 of these is a travel allowance' : `${flagged} of these are travel allowances`} whose route distance could not be calculated, so the amount is lower than it should be. Check before paying.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
