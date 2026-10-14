'use client';

import type { PayComponentKind } from '@greynote/contracts';
import { Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { formatMoney } from '@/lib/format';
import type { CtcEditorState } from '../../hooks/useCtcEditor';
import {
  addExtra,
  dependentsOf,
  removeExtra,
  removeLine,
  removedLines,
  resetRule,
  restoreLine,
  setRule,
  updateExtra,
  type EditorRow,
  type RuleDraft,
  type StructureDraft,
} from '../../lib/ctcStructure';
import { CtcAddLineDialog } from './CtcAddLineDialog';
import { CtcLineRow } from './CtcLineRow';

const GROUPS: Array<{ kind: PayComponentKind; title: string; add: string }> = [
  { kind: 'EARNING', title: 'Earnings (they add up to the CTC)', add: 'Add earning' },
  { kind: 'DEDUCTION', title: 'Deductions (taken from the pay each month)', add: 'Add deduction' },
];

/**
 * The breakdown as two lists, what the employee earns (it adds up to the CTC) and what is deducted from it, with every line editable in place.
 * It fades while a new result is being worked out, so figures never look final when they are not.
 */
export function CtcBreakdown({
  editor,
  structure,
  onStructureChange,
}: {
  editor: CtcEditorState;
  structure: StructureDraft;
  onStructureChange: (next: StructureDraft) => void;
}) {
  const { rows, org, preview, structureErrors } = editor;
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<PayComponentKind | null>(null);
  const changed =
    structure.removed.length > 0 ||
    structure.extras.length > 0 ||
    Object.keys(structure.rules).length > 0;
  const [customise, setCustomise] = useState(changed);
  const lines = preview.data?.lines ?? [];
  const basicEntered =
    structure.basicMode === 'percent'
      ? structure.basicPercent.trim() !== ''
      : structure.basicAmount.trim() !== '';
  // Basic is the whole CTC: nothing else is worked out, only professional tax comes off (the server decides; this just explains it).
  const basicOnly =
    basicEntered &&
    !preview.isFetching &&
    lines.length > 0 &&
    lines.filter((l) => l.kind === 'EARNING').every((l) => l.code === 'BASIC') &&
    (structure.basicMode === 'amount' || Number(structure.basicPercent) === 100);
  const ptaxMonthly = Math.round(
    (lines.find((l) => l.kind === 'DEDUCTION' && l.code === 'PTAX')?.amountPaise ?? 0) / 12,
  );
  const amountOf = (code: string) => lines.find((l) => l.code === code)?.amountPaise;
  const nameOf = (code: string) =>
    rows.find((r) => r.code === code)?.name ?? org.find((c) => c.code === code)?.name ?? code;
  const keyOf = (r: EditorRow) => r.extraId ?? r.code;
  // A percentage can only be taken of earnings, never of the balancer or a deduction.
  const bases = rows.filter((r) => r.rule !== 'BALANCER' && r.kind === 'EARNING');

  const changeRule = (row: EditorRow, rule: RuleDraft) =>
    onStructureChange(
      row.extraId
        ? updateExtra(structure, row.extraId, { rule })
        : setRule(structure, row.code, rule),
    );

  if (basicOnly) {
    const grossMonthly = Math.round(
      lines.filter((l) => l.kind === 'EARNING').reduce((n, l) => n + l.amountPaise, 0) / 12,
    );
    return (
      <section
        aria-label="Basic only"
        className="rounded-lg border border-border bg-surface p-5 text-sm"
      >
        <p className="font-medium text-text">Basic is 100% of the CTC.</p>
        <p className="mt-1 text-text-muted">
          There is no HRA, allowance, EPF or ESI. Only professional tax comes off:{' '}
          {formatMoney(grossMonthly)} a month − {formatMoney(ptaxMonthly)} PTax ={' '}
          <span className="font-semibold text-text">{formatMoney(grossMonthly - ptaxMonthly)}</span>{' '}
          in the bank.
        </p>
      </section>
    );
  }

  return (
    <div className={cn('space-y-6 transition-opacity', preview.isFetching && 'opacity-60')}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {customise
            ? 'Remove a line with ×, open it to change how it is worked out, or add one.'
            : 'Split by the company pay components from Basic and the CTC.'}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCustomise(!customise)}
          aria-pressed={customise}
        >
          <Settings2 aria-hidden className="size-4" />{' '}
          {customise ? 'Done customising' : 'Customise components'}
        </Button>
      </div>
      {customise && removedLines(org, structure).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-subtle">Removed:</span>
          {removedLines(org, structure).map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => onStructureChange(restoreLine(structure, c.code))}
              className="rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              + {c.name}
            </button>
          ))}
        </div>
      ) : null}
      {GROUPS.map((group) => {
        const groupRows = rows.filter((r) => r.kind === group.kind);
        return (
          <section key={group.kind} aria-label={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
              {group.title}
            </h3>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {groupRows.length === 0 ? (
                <li className="px-5 py-4 text-sm text-text-muted">None for this employee.</li>
              ) : null}
              {groupRows.map((row) => {
                const dependents = dependentsOf(row.code, rows);
                const removeBlocked =
                  row.lockedReason ??
                  (dependents.length > 0
                    ? `${dependents.join(', ')} is worked out from this line. Change that one first.`
                    : null);
                return (
                  <CtcLineRow
                    key={keyOf(row)}
                    readOnly={!customise}
                    row={row}
                    annualPaise={amountOf(row.code)}
                    nameOf={nameOf}
                    bases={bases}
                    open={open === keyOf(row)}
                    onToggle={() => setOpen(open === keyOf(row) ? null : keyOf(row))}
                    onRule={(rule) => changeRule(row, rule)}
                    onReset={
                      row.edited && !row.extraId && row.code !== 'BASIC'
                        ? () => onStructureChange(resetRule(structure, row.code))
                        : null
                    }
                    onRemove={() => {
                      setOpen(null);
                      onStructureChange(
                        row.extraId
                          ? removeExtra(structure, row.extraId)
                          : removeLine(structure, row.code),
                      );
                    }}
                    removeBlocked={removeBlocked}
                    error={
                      structureErrors[row.extraId ? `extra:${row.extraId}` : `rule:${row.code}`]
                    }
                  />
                );
              })}
              {customise ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setAdding(group.kind)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-surface-subtle focus-visible:shadow-focus focus-visible:outline-none sm:px-5"
                  >
                    <Plus aria-hidden className="size-4" /> {group.add}
                  </button>
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}

      {adding ? (
        <CtcAddLineDialog
          kind={adding}
          rows={rows}
          restorable={removedLines(org, structure).filter((c) => c.kind === adding)}
          onClose={() => setAdding(null)}
          onRestore={(code) => {
            onStructureChange(restoreLine(structure, code));
            setAdding(null);
          }}
          onAdd={(line) => {
            onStructureChange(addExtra(structure, line));
            setAdding(null);
          }}
        />
      ) : null}
    </div>
  );
}
