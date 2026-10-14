'use client';

import type { PayComponentDto, PayComponentKind } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreatePayComponent, useUpdatePayComponent } from '../hooks/useCtc';
import {
  EMPTY_COMPONENT_DRAFT,
  KIND_LABEL,
  RULE_LABEL,
  ruleTypesFor,
  buildPayComponent,
  buildPayComponentUpdate,
  componentToDraft,
  type ComponentDraft,
  type RuleType,
} from '../lib/ctc';

/** Create (no `component`) or edit. The code is what overrides and other components refer to, so it is fixed once created. */
export function PayComponentFormDialog({
  component,
  all,
  onClose,
}: {
  component?: PayComponentDto | undefined;
  /** Every component, to choose "percentage of …" from and to suggest the next order. */
  all: readonly PayComponentDto[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ComponentDraft>(
    component ? componentToDraft(component) : { ...EMPTY_COMPONENT_DRAFT, order: String(Math.max(0, ...all.map((c) => c.order)) + 1) },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePayComponent(onClose);
  const update = useUpdatePayComponent(onClose);
  const set = (patch: Partial<ComponentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function submit() {
    if (component) {
      const built = buildPayComponentUpdate(component, draft);
      if (!built.ok) return setErrors(built.errors);
      if (Object.keys(built.body).length === 0) return onClose();
      return update.mutate({ id: component.id, body: built.body });
    }
    const built = buildPayComponent(draft);
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  // A percentage can be taken of any other earning — never of the balancer, a deduction, or itself.
  const referable = all.filter((c) => c.rule.type !== 'BALANCER' && c.kind === 'EARNING' && c.code !== draft.code.trim().toUpperCase());
  // A mandatory line (professional tax) keeps its kind and rule: only its name and place in the list change.
  const locked = component?.mandatory === true;
  const ruleOptions = ruleTypesFor(draft.kind).filter((r) => r !== 'PTAX_SLAB' || draft.ruleType === 'PTAX_SLAB');
  const toggleOf = (code: string) => set({ of: draft.of.includes(code) ? draft.of.filter((c) => c !== code) : [...draft.of, code] });

  return (
    <FormDialog
      title={component ? `Edit ${component.name}` : 'New component'}
      description={
        component
          ? 'Applies to CTCs worked out from now on. Saved CTCs keep their breakdown until you re-apply the formula.'
          : 'A line of the CTC split, such as HRA or Conveyance. The balancer line takes whatever the others leave.'
      }
      formId="pay-component-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Code" htmlFor="pc-code" error={errors['code']}>
        <Input id="pc-code" value={draft.code} disabled={Boolean(component)} placeholder="HRA" onChange={(e) => set({ code: e.target.value })} aria-invalid={errors['code'] ? true : undefined} />
      </FormField>
      <FormField label="Name" htmlFor="pc-name" error={errors['name']}>
        <Input id="pc-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <FormField label="Kind" htmlFor="pc-kind">
        <Select
          id="pc-kind"
          value={draft.kind}
          disabled={locked}
          onValueChange={(v) => {
            const kind = v as PayComponentKind;
            // A rule that only fits one kind is dropped when the kind changes.
            set({ kind, ruleType: ruleTypesFor(kind).includes(draft.ruleType) ? draft.ruleType : 'PERCENT_OF_CTC' });
          }}
          options={(['EARNING', 'DEDUCTION'] as PayComponentKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
      </FormField>
      <FormField label="How it is worked out" htmlFor="pc-rule">
        <Select
          id="pc-rule"
          value={draft.ruleType}
          disabled={locked}
          onValueChange={(v) => set({ ruleType: v as RuleType })}
          options={ruleOptions.map((r) => ({ value: r, label: RULE_LABEL[r] }))}
        />
      </FormField>
      {draft.ruleType === 'PTAX_SLAB' ? (
        <p className="text-sm text-text-muted">
          The amount for each salary band is set in Settings → Payroll → Professional tax slabs. The first band is also the lowest monthly salary that can be assigned.
        </p>
      ) : null}
      {draft.ruleType === 'PERCENT_OF_CTC' || draft.ruleType === 'PERCENT_OF_COMPONENTS' || draft.ruleType === 'ESI_PERCENT' ? (
        <FormField label="Percentage (%)" htmlFor="pc-percent" error={errors['percent']}>
          <Input id="pc-percent" inputMode="decimal" value={draft.percent} placeholder="0.75" onChange={(e) => set({ percent: e.target.value })} aria-invalid={errors['percent'] ? true : undefined} />
        </FormField>
      ) : null}
      {draft.ruleType === 'PERCENT_OF_COMPONENTS' ? (
        <FormField label="Percentage of" htmlFor="pc-of" error={errors['of']}>
          <div id="pc-of" className="flex flex-wrap gap-x-4 gap-y-2">
            {referable.map((c) => (
              <label key={c.code} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.of.includes(c.code)} onChange={() => toggleOf(c.code)} className="size-4 accent-accent" />
                {c.name}
              </label>
            ))}
          </div>
        </FormField>
      ) : null}
      {draft.ruleType === 'FIXED' ? (
        <FormField label="Amount a year (₹)" htmlFor="pc-amount" error={errors['amount']}>
          <Input id="pc-amount" inputMode="decimal" value={draft.amount} placeholder="6000" onChange={(e) => set({ amount: e.target.value })} aria-invalid={errors['amount'] ? true : undefined} />
        </FormField>
      ) : null}
      <FormField label="Position in the list" htmlFor="pc-order" error={errors['order']}>
        <Input id="pc-order" inputMode="numeric" value={draft.order} onChange={(e) => set({ order: e.target.value })} aria-invalid={errors['order'] ? true : undefined} />
      </FormField>
      {component ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.isActive} disabled={locked} onChange={(e) => set({ isActive: e.target.checked })} className="size-4 accent-accent" />
          In use (untick to leave it out of new CTCs)
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.mandatory} disabled={locked} onChange={(e) => set({ mandatory: e.target.checked })} className="size-4 accent-accent" />
        Mandatory (every employee has it: it cannot be switched off or removed for one employee)
      </label>
    </FormDialog>
  );
}
