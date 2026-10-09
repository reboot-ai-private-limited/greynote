'use client';

import type { PayComponentDto, PayComponentKind } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { KIND_LABEL } from '../lib/ctc';
import { draftToRule, type EditorRow, type RuleDraft } from '../lib/ctcStructure';

type RuleType = RuleDraft['type'];

const TYPE_OPTIONS: Array<{ value: RuleType; label: string }> = [
  { value: 'PERCENT_OF_COMPONENTS', label: 'A percentage of other lines' },
  { value: 'PERCENT_OF_CTC', label: 'A percentage of the CTC' },
  { value: 'FIXED', label: 'A fixed amount a year' },
];

export interface LineValue {
  name: string;
  kind: PayComponentKind;
  rule: RuleDraft;
}

/**
 * Change how one line is worked out for this employee (its rule), or add a new line that exists only for them. When adding,
 * lines Admin's formula has that were removed for this employee can be put back with one click.
 */
export function CtcLineDialog({
  mode,
  initial,
  rows,
  selfCode,
  restorable = [],
  onApply,
  onRestore,
  onClose,
}: {
  mode: 'edit' | 'add';
  initial?: LineValue;
  /** The lines the employee has now, to choose what a percentage is of. */
  rows: readonly EditorRow[];
  /** The line being edited, so it is not offered as its own base. */
  selfCode?: string;
  restorable?: readonly PayComponentDto[];
  onApply: (value: LineValue) => void;
  onRestore?: (code: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<PayComponentKind>(initial?.kind ?? 'EARNING');
  const [type, setType] = useState<RuleType>(initial?.rule.type ?? 'PERCENT_OF_COMPONENTS');
  const [percent, setPercent] = useState(
    initial && initial.rule.type !== 'FIXED' ? initial.rule.percent : '',
  );
  const [amount, setAmount] = useState(initial?.rule.type === 'FIXED' ? initial.rule.amount : '');
  const [of, setOf] = useState<string[]>(
    initial?.rule.type === 'PERCENT_OF_COMPONENTS' ? initial.rule.of : ['BASIC'],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A percentage of the balancer is not allowed, nor of itself.
  const bases = rows.filter((r) => r.rule !== 'BALANCER' && r.code !== selfCode);

  function submit() {
    const rule: RuleDraft =
      type === 'FIXED'
        ? { type, amount }
        : type === 'PERCENT_OF_CTC'
          ? { type, percent }
          : { type, percent, of };
    const next: Record<string, string> = {};
    if (mode === 'add' && name.trim() === '') next['name'] = 'Give the line a name.';
    if (!draftToRule(rule)) {
      next['rule'] =
        type === 'FIXED'
          ? 'Use rupees with at most two decimals.'
          : type === 'PERCENT_OF_COMPONENTS' && of.length === 0
            ? 'Choose at least one line.'
            : 'Use a percentage from 0 to 100, with at most two decimals.';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onApply({ name, kind, rule });
  }

  return (
    <FormDialog
      title={mode === 'add' ? 'Add a line' : `How ${initial?.name ?? 'this line'} is worked out`}
      formId="ctc-line-form"
      pending={false}
      onClose={onClose}
      onSubmit={submit}
    >
      {mode === 'add' && restorable.length > 0 ? (
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-sm font-medium text-text">Put back a removed line</p>
          <div className="flex flex-wrap gap-2">
            {restorable.map((c) => (
              <Button
                key={c.code}
                variant="secondary"
                size="sm"
                onClick={() => onRestore?.(c.code)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'add' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="line-name" error={errors['name']}>
            <Input
              id="line-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors['name'] ? true : undefined}
            />
          </FormField>
          <FormField label="Counts as" htmlFor="line-kind">
            <Select
              id="line-kind"
              value={kind}
              onValueChange={(v) => setKind(v as PayComponentKind)}
              options={(Object.keys(KIND_LABEL) as PayComponentKind[]).map((k) => ({
                value: k,
                label: KIND_LABEL[k],
              }))}
            />
          </FormField>
        </div>
      ) : null}

      <FormField label="Worked out as" htmlFor="line-type">
        <Select
          id="line-type"
          value={type}
          onValueChange={(v) => setType(v as RuleType)}
          options={TYPE_OPTIONS}
        />
      </FormField>

      {type === 'FIXED' ? (
        <FormField label="Amount a year (₹)" htmlFor="line-amount" error={errors['rule']}>
          <Input
            id="line-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={errors['rule'] ? true : undefined}
          />
        </FormField>
      ) : (
        <FormField label="Percentage" htmlFor="line-percent" error={errors['rule']}>
          <Input
            id="line-percent"
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            aria-invalid={errors['rule'] ? true : undefined}
          />
        </FormField>
      )}

      {type === 'PERCENT_OF_COMPONENTS' ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-text">Of</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {bases.map((r) => (
              <label key={r.code} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={of.includes(r.code)}
                  onChange={(e) =>
                    setOf((cur) =>
                      e.target.checked ? [...cur, r.code] : cur.filter((c) => c !== r.code),
                    )
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </FormDialog>
  );
}
