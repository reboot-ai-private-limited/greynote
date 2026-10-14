'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { formatMoney } from '@/lib/format';
import type { CtcEditorState } from '../../hooks/useCtcEditor';
import { monthlyOf, parseCtc } from '../../lib/ctc';
import { ctcTotals, type StructureDraft } from '../../lib/ctcStructure';

type Tone = 'success' | 'danger' | 'muted';

function status(
  editor: CtcEditorState,
  ctcPaise: number | null,
  totalPaise: number,
): { tone: Tone; text: string } | null {
  if (ctcPaise === null) return { tone: 'muted', text: 'Enter the CTC to see the breakdown.' };
  if (editor.previewError) return { tone: 'danger', text: editor.previewError };
  if (editor.preview.isFetching) return { tone: 'muted', text: 'Working it out…' };
  if (totalPaise === ctcPaise && editor.preview.data)
    return { tone: 'success', text: 'Total earnings = CTC ✓ The earnings add up to the CTC exactly.' };
  if (editor.preview.data) return { tone: 'danger', text: 'The earnings do not add up to the CTC.' };
  return null;
}

const toneClass: Record<Tone, string> = {
  success: 'text-success-fg',
  danger: 'text-danger-fg',
  muted: 'text-text-muted',
};

/**
 * The two inputs that drive everything (CTC and Basic %), what they come to, and whether the breakdown holds together. `compact`
 * lays it out in one row for the wizard; `children` is for fields only the full screen has (start month, reason) and `footer`
 * for its Save / Cancel.
 */
export function CtcSummaryCard({
  ctc,
  onCtcChange,
  structure,
  onStructureChange,
  editor,
  errors,
  compact = false,
  children,
  footer,
}: {
  ctc: string;
  onCtcChange: (ctc: string) => void;
  structure: StructureDraft;
  onStructureChange: (next: StructureDraft) => void;
  editor: CtcEditorState;
  errors: Record<string, string>;
  compact?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ctcPaise = parseCtc(ctc);
  const lines = editor.preview.data?.lines ?? [];
  const totals = ctcTotals(lines);
  const orgBasic = editor.org.find((c) => c.code === 'BASIC');
  const orgBasicPercent =
    orgBasic?.rule.type === 'PERCENT_OF_CTC' ? String(orgBasic.rule.basisPoints / 100) : '40';
  const state = status(editor, ctcPaise, totals.paidPaise);
  const basicError = errors['basicPercent'] ?? editor.structureErrors['basicPercent'];
  const preview = editor.preview.data;
  const showFigures = ctcPaise !== null && lines.length > 0 && !editor.previewError;

  const figures: Array<[string, string, string]> = [
    ['Total earnings a month', formatMoney(monthlyOf(totals.paidPaise)), `${formatMoney(totals.paidPaise)} a year`],
    ['Deductions a month', formatMoney(preview?.deductionsMonthlyPaise ?? 0), 'EPF, ESI, professional tax'],
    ['Take-home a month', formatMoney(preview?.takeHomeMonthlyPaise ?? 0), 'before leave and absent days'],
  ];

  return (
    <section aria-label="CTC" className="rounded-lg border border-border bg-surface">
      <div className={cn('grid gap-4 p-5', compact && 'sm:grid-cols-2')}>
        <FormField label="CTC per year (₹)" htmlFor="ctc-amount" error={errors['ctc']}>
          <Input
            id="ctc-amount"
            inputMode="decimal"
            className="h-11 text-base font-medium"
            value={ctc}
            placeholder="144000"
            onChange={(e) => onCtcChange(e.target.value)}
            aria-invalid={errors['ctc'] ? true : undefined}
          />
        </FormField>
        <FormField
          label={structure.basicMode === 'percent' ? 'Basic salary (% of CTC)' : 'Basic salary (₹ a month)'}
          htmlFor="ctc-basic"
          error={basicError}
          hint={
            structure.basicMode === 'percent'
              ? `Up to 100%. Leave empty for the usual ${orgBasicPercent}%. Every other line is worked out from Basic and the CTC.`
              : 'The monthly Basic. Every other line is worked out from it and the CTC.'
          }
        >
          <div className="flex gap-2">
            <Input
              id="ctc-basic"
              inputMode="decimal"
              className="h-11 flex-1 text-base font-medium"
              value={structure.basicMode === 'percent' ? structure.basicPercent : structure.basicAmount}
              placeholder={structure.basicMode === 'percent' ? orgBasicPercent : '5600'}
              onChange={(e) =>
                onStructureChange(
                  structure.basicMode === 'percent'
                    ? { ...structure, basicPercent: e.target.value }
                    : { ...structure, basicAmount: e.target.value },
                )
              }
              aria-invalid={basicError ? true : undefined}
            />
            <div role="group" aria-label="Enter Basic as" className="flex shrink-0 overflow-hidden rounded-md border border-border-strong">
              {(['percent', 'amount'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={structure.basicMode === mode}
                  onClick={() => onStructureChange({ ...structure, basicMode: mode })}
                  className={cn(
                    'px-3 text-sm font-medium focus-visible:shadow-focus focus-visible:outline-none',
                    structure.basicMode === mode ? 'bg-accent text-white' : 'bg-surface text-text hover:bg-surface-hover',
                  )}
                >
                  {mode === 'percent' ? '%' : '₹'}
                </button>
              ))}
            </div>
          </div>
        </FormField>
      </div>

      {showFigures ? (
        <dl
          className={cn(
            'grid gap-px border-t border-border bg-border',
            compact ? 'sm:grid-cols-3' : '',
          )}
        >
          {figures.map(([label, value, note]) => (
            <div key={label} className="bg-surface px-5 py-3">
              <dt className="text-xs text-text-subtle">{label}</dt>
              <dd className="text-base font-semibold tabular-nums text-text">
                {value}
                {note ? (
                  <span className="ml-2 text-xs font-normal text-text-muted">{note}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {state ? (
        <p
          role={state.tone === 'danger' ? 'alert' : 'status'}
          className={cn('border-t border-border px-5 py-3 text-sm', toneClass[state.tone])}
        >
          {state.text}
        </p>
      ) : null}

      {children ? <div className="space-y-4 border-t border-border p-5">{children}</div> : null}
      {footer ? <div className="flex gap-2 border-t border-border p-5">{footer}</div> : null}
    </section>
  );
}
