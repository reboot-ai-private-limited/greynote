'use client';

import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { formatMoney } from '@/lib/format';
import type { CtcEditorState } from '../hooks/useCtcEditor';
import { monthlyOf, parseCtc } from '../lib/ctc';
import {
  addExtra,
  dependentsOf,
  describeRule,
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
} from '../lib/ctcStructure';
import { CtcLineDialog } from './CtcLineDialog';

const inr = (rupees: string): string => formatMoney(Math.round(Number(rupees || 0) * 100));

/**
 * CTC and Basic %, then the breakdown they produce. Every line can be changed for this employee — its percentage or amount,
 * what it is a percentage of — and lines can be removed or added; the last line ("Other allowance") takes whatever is left, so
 * the lines always add up to the CTC. The numbers come from the server's preview as you type.
 */
export function CtcBreakdownEditor({
  ctc,
  onCtcChange,
  structure,
  onStructureChange,
  editor,
  errors,
}: {
  ctc: string;
  onCtcChange: (ctc: string) => void;
  structure: StructureDraft;
  onStructureChange: (next: StructureDraft) => void;
  editor: CtcEditorState;
  errors: Record<string, string>;
}) {
  const { rows, org, preview, previewError, structureErrors } = editor;
  const [editing, setEditing] = useState<EditorRow | null>(null);
  const [adding, setAdding] = useState(false);
  const ctcPaise = parseCtc(ctc);
  const lines = preview.data?.lines ?? [];
  const amountOf = (code: string) => lines.find((l) => l.code === code)?.amountPaise;
  const nameOf = (code: string) =>
    rows.find((r) => r.code === code)?.name ?? org.find((c) => c.code === code)?.name ?? code;
  const total = lines.reduce((sum, l) => sum + l.amountPaise, 0);
  const matches = ctcPaise !== null && lines.length > 0 && total === ctcPaise;
  const orgBasic = org.find((c) => c.code === 'BASIC');
  const orgBasicPercent =
    orgBasic?.rule.type === 'PERCENT_OF_CTC' ? String(orgBasic.rule.basisPoints / 100) : '30';

  const changeRule = (row: EditorRow, rule: RuleDraft) =>
    onStructureChange(
      row.extraId
        ? updateExtra(structure, row.extraId, { rule })
        : setRule(structure, row.code, rule),
    );
  const setValue = (row: EditorRow, text: string) => {
    if (row.rule === 'BALANCER') return;
    changeRule(
      row,
      row.rule.type === 'FIXED' ? { type: 'FIXED', amount: text } : { ...row.rule, percent: text },
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="CTC per year (₹)" htmlFor="ctc-amount" error={errors['ctc']}>
          <Input
            id="ctc-amount"
            inputMode="decimal"
            value={ctc}
            placeholder="144000"
            onChange={(e) => onCtcChange(e.target.value)}
            aria-invalid={errors['ctc'] ? true : undefined}
          />
        </FormField>
        <FormField
          label="Basic salary (% of CTC)"
          htmlFor="ctc-basic"
          error={errors['basicPercent'] ?? structureErrors['basicPercent']}
        >
          <Input
            id="ctc-basic"
            inputMode="decimal"
            value={structure.basicPercent}
            placeholder={orgBasicPercent}
            onChange={(e) => onStructureChange({ ...structure, basicPercent: e.target.value })}
            aria-invalid={
              errors['basicPercent'] || structureErrors['basicPercent'] ? true : undefined
            }
          />
        </FormField>
      </div>
      {ctcPaise !== null ? (
        <p className="-mt-3 text-xs text-text-muted">{formatMoney(monthlyOf(ctcPaise))} a month</p>
      ) : null}

      <div aria-live="polite">
        {ctcPaise === null ? (
          <p className="text-sm text-text-muted">Enter the CTC to see the breakdown.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-[13px] text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Component
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    How it is worked out
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Per year
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Per month
                  </th>
                  <th scope="col" className="w-24 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const annual = amountOf(row.code);
                  const dependents = dependentsOf(row.code, rows);
                  const removeBlocked =
                    row.lockedReason ??
                    (dependents.length > 0
                      ? `${dependents.join(', ')} is worked out from this line. Change that first.`
                      : null);
                  const rowError =
                    structureErrors[row.extraId ? `extra:${row.extraId}` : `rule:${row.code}`];
                  return (
                    <tr key={row.extraId ?? row.code} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          {row.name || <span className="text-text-subtle">New line</span>}
                          {row.kind === 'EMPLOYER_CONTRIBUTION' ? <Badge>Employer</Badge> : null}
                          {row.edited && row.code !== 'BASIC' ? (
                            <Badge tone="accent">{row.extraId ? 'Added' : 'Edited'}</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.rule === 'BALANCER' || row.code === 'BASIC' ? (
                          <span className="text-text-muted">
                            {describeRule(row.rule, nameOf, inr)}
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.rule.type === 'FIXED' ? (
                              <span className="text-text-muted">₹</span>
                            ) : null}
                            <Input
                              aria-label={`${row.name} ${row.rule.type === 'FIXED' ? 'amount a year' : 'percentage'}`}
                              inputMode="decimal"
                              className="h-8 w-24 text-right tabular-nums"
                              value={row.rule.type === 'FIXED' ? row.rule.amount : row.rule.percent}
                              onChange={(e) => setValue(row, e.target.value)}
                              aria-invalid={rowError ? true : undefined}
                            />
                            <span className="text-text-muted">
                              {row.rule.type === 'FIXED'
                                ? 'a year'
                                : row.rule.type === 'PERCENT_OF_CTC'
                                  ? '% of CTC'
                                  : `% of ${row.rule.of.map(nameOf).join(' + ')}`}
                            </span>
                          </div>
                        )}
                        {rowError ? (
                          <p role="alert" className="mt-1 text-[13px] text-danger-fg">
                            {rowError}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {annual === undefined ? '—' : formatMoney(annual)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                        {annual === undefined ? '—' : formatMoney(monthlyOf(annual))}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-0.5">
                          {!row.lockedReason ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Change how ${row.name} is worked out`}
                              title="Change how it is worked out"
                              onClick={() => setEditing(row)}
                            >
                              <Pencil aria-hidden className="size-4" />
                            </Button>
                          ) : null}
                          {row.edited && !row.extraId && row.code !== 'BASIC' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Reset ${row.name} to the formula`}
                              title="Back to the formula"
                              onClick={() => onStructureChange(resetRule(structure, row.code))}
                            >
                              <RotateCcw aria-hidden className="size-4" />
                            </Button>
                          ) : null}
                          {!row.lockedReason ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${row.name}`}
                              title={removeBlocked ?? 'Remove for this employee'}
                              disabled={removeBlocked !== null}
                              onClick={() =>
                                onStructureChange(
                                  row.extraId
                                    ? removeExtra(structure, row.extraId)
                                    : removeLine(structure, row.code),
                                )
                              }
                            >
                              <Trash2 aria-hidden className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-surface-subtle font-medium">
                  <td className="px-3 py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {lines.length > 0 ? formatMoney(total) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {lines.length > 0 ? formatMoney(monthlyOf(total)) : '—'}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {previewError ? (
          <p role="alert" className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {previewError}
          </p>
        ) : matches ? (
          <p className="mt-3 text-sm text-success-fg">The lines add up to the CTC.</p>
        ) : preview.isFetching ? (
          <p className="mt-3 text-sm text-text-muted">Working it out…</p>
        ) : null}
      </div>

      {ctcPaise !== null ? (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-4" /> Add a line
        </Button>
      ) : null}

      {editing && editing.rule !== 'BALANCER' ? (
        <CtcLineDialog
          mode="edit"
          initial={{ name: editing.name, kind: editing.kind, rule: editing.rule }}
          rows={rows}
          selfCode={editing.code}
          onClose={() => setEditing(null)}
          onApply={(value) => {
            changeRule(editing, value.rule);
            setEditing(null);
          }}
        />
      ) : null}
      {adding ? (
        <CtcLineDialog
          mode="add"
          rows={rows}
          restorable={removedLines(org, structure)}
          onRestore={(code) => {
            onStructureChange(restoreLine(structure, code));
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
          onApply={(value) => {
            onStructureChange(addExtra(structure, value));
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}
