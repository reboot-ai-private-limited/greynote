'use client';

import type { PayComponentKind } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/ui/cn';
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
  { kind: 'EARNING', title: 'Earnings', add: 'Add earning' },
  { kind: 'EMPLOYER_CONTRIBUTION', title: 'Employer contributions', add: 'Add contribution' },
];

/**
 * The breakdown as two lists, what the employee is paid and what the employer puts in on top, with every line editable in place.
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
  const lines = preview.data?.lines ?? [];
  const amountOf = (code: string) => lines.find((l) => l.code === code)?.amountPaise;
  const nameOf = (code: string) =>
    rows.find((r) => r.code === code)?.name ?? org.find((c) => c.code === code)?.name ?? code;
  const keyOf = (r: EditorRow) => r.extraId ?? r.code;
  const bases = rows.filter((r) => r.rule !== 'BALANCER');

  const changeRule = (row: EditorRow, rule: RuleDraft) =>
    onStructureChange(
      row.extraId
        ? updateExtra(structure, row.extraId, { rule })
        : setRule(structure, row.code, rule),
    );

  return (
    <div className={cn('space-y-6 transition-opacity', preview.isFetching && 'opacity-60')}>
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
              <li>
                <button
                  type="button"
                  onClick={() => setAdding(group.kind)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-surface-subtle focus-visible:shadow-focus focus-visible:outline-none sm:px-5"
                >
                  <Plus aria-hidden className="size-4" /> {group.add}
                </button>
              </li>
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
