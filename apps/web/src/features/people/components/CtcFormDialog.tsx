'use client';

import type { CtcAssignmentDto, PayComponentDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { istMonth } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { paiseToRupees } from '@/lib/money';
import { useAssignCtc, useCtcPreview, usePayComponents } from '../hooks/useCtc';
import { buildAssignCtc, buildPreview, ctcWarning, monthlyOf, parseCtc, type CtcDraft } from '../lib/ctc';

/**
 * Set or revise an employee's CTC. The breakdown fills in from the org formula as the CTC is typed; any line except the
 * balancer can be edited for this employee, and the balancer takes the difference so the lines always add up. Saving adds a
 * new revision from the chosen month — earlier ones are kept.
 */
export function CtcFormDialog({
  userId,
  current,
  suggestedCtcPaise,
  onClose,
}: {
  userId: string;
  /** The revision in force today, to start from. */
  current?: CtcAssignmentDto | undefined;
  /** The employee's grade's suggestion, used when there is no CTC yet. */
  suggestedCtcPaise?: number | null | undefined;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CtcDraft>(() => ({
    ctc: current ? paiseToRupees(current.ctcAnnualPaise) : suggestedCtcPaise ? paiseToRupees(suggestedCtcPaise) : '',
    effectiveFrom: istMonth(),
    reason: '',
    overrides: Object.fromEntries(Object.entries(current?.overrides ?? {}).map(([code, paise]) => [code, paiseToRupees(paise)])),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const components = usePayComponents();
  const preview = useCtcPreview(buildPreview(draft.ctc, draft.overrides));
  const save = useAssignCtc(userId, onClose);

  const balancerCode = components.data?.find((c: PayComponentDto) => c.rule.type === 'BALANCER')?.code;
  const ctcPaise = parseCtc(draft.ctc);
  const warning = ctcWarning(ctcPaise);
  const set = (patch: Partial<CtcDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setOverride = (code: string, text: string) => set({ overrides: { ...draft.overrides, [code]: text } });
  const clearOverride = (code: string) => {
    set({ overrides: Object.fromEntries(Object.entries(draft.overrides).filter(([c]) => c !== code)) });
  };

  function submit() {
    const built = buildAssignCtc(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    save.mutate(built.body);
  }

  const lines = preview.data?.lines ?? [];
  const previewError = preview.error instanceof Error ? preview.error.message : undefined;

  return (
    <FormDialog
      title={current ? 'Revise CTC' : 'Set CTC'}
      description="The breakdown follows the org's pay components. Edit a line to give this employee something different; Other allowance takes the rest."
      formId="ctc-form"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="CTC per year (₹)" htmlFor="ctc-amount" error={errors['ctc']}>
          <Input id="ctc-amount" inputMode="decimal" value={draft.ctc} placeholder="144000" onChange={(e) => set({ ctc: e.target.value })} aria-invalid={errors['ctc'] ? true : undefined} />
        </FormField>
        <FormField label="Starts from" htmlFor="ctc-from" error={errors['effectiveFrom']}>
          <Input id="ctc-from" type="month" value={draft.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} aria-invalid={errors['effectiveFrom'] ? true : undefined} />
        </FormField>
      </div>
      {ctcPaise !== null ? <p className="-mt-2 text-xs text-text-muted">{formatMoney(monthlyOf(ctcPaise))} a month</p> : null}
      {warning ? (
        <p role="status" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          {warning}
        </p>
      ) : null}

      <div aria-live="polite">
        {previewError ? (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {previewError}
          </p>
        ) : null}
        {lines.length > 0 && preview.data ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Component</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Per year (₹)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Per month</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const edited = l.code in draft.overrides;
                  const fixed = l.code === balancerCode;
                  return (
                    <tr key={l.code} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          {l.name}
                          {l.kind === 'EMPLOYER_CONTRIBUTION' ? <Badge>Employer</Badge> : null}
                          {edited ? (
                            <Button variant="secondary" size="sm" onClick={() => clearOverride(l.code)}>
                              Reset
                            </Button>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {fixed ? (
                          <span className="tabular-nums">{paiseToRupees(l.amountPaise)}</span>
                        ) : (
                          <Input
                            aria-label={`${l.name} per year`}
                            inputMode="decimal"
                            className="h-8 w-36 text-right tabular-nums"
                            value={edited ? (draft.overrides[l.code] ?? '') : paiseToRupees(l.amountPaise)}
                            onChange={(e) => setOverride(l.code, e.target.value)}
                            aria-invalid={errors[`override:${l.code}`] ? true : undefined}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(monthlyOf(l.amountPaise))}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border font-medium">
                  <td className="px-3 py-2">Paid to the employee</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(preview.data.grossAnnualPaise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(preview.data.grossMonthlyPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : ctcPaise === null ? (
          <p className="text-sm text-text-muted">Enter the CTC to see the breakdown.</p>
        ) : preview.isFetching ? (
          <p className="text-sm text-text-muted">Working it out…</p>
        ) : null}
      </div>

      <FormField label="Reason (optional)" htmlFor="ctc-reason" error={errors['reason']}>
        <Input id="ctc-reason" value={draft.reason} placeholder="Annual review" onChange={(e) => set({ reason: e.target.value })} />
      </FormField>
    </FormDialog>
  );
}
