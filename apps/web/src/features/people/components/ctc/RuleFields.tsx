'use client';

import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { EditorRow, RuleDraft } from '../../lib/ctcStructure';

type RuleType = RuleDraft['type'];

const TYPE_OPTIONS: Array<{ value: RuleType; label: string }> = [
  { value: 'PERCENT_OF_COMPONENTS', label: 'A percentage of other lines' },
  { value: 'PERCENT_OF_CTC', label: 'A percentage of the CTC' },
  { value: 'FIXED', label: 'A fixed amount a year' },
];

/** A fresh rule of a type, carrying over what was typed where it still makes sense. */
export function switchRuleType(current: RuleDraft, type: RuleType): RuleDraft {
  if (type === current.type) return current;
  const percent = current.type === 'FIXED' ? '' : current.percent;
  if (type === 'FIXED') return { type, amount: '' };
  if (type === 'PERCENT_OF_CTC') return { type, percent };
  return { type, percent, of: current.type === 'PERCENT_OF_COMPONENTS' ? current.of : ['BASIC'] };
}

/** The fields that define a rule: its kind, the percentage or the amount, and (for a percentage of lines) which lines. */
export function RuleFields({
  idPrefix,
  value,
  onChange,
  bases,
  error,
}: {
  idPrefix: string;
  value: RuleDraft;
  onChange: (next: RuleDraft) => void;
  /** The lines a percentage may be taken of: not the line itself, not the balancer. */
  bases: readonly EditorRow[];
  error?: string | undefined;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Worked out as" htmlFor={`${idPrefix}-type`}>
        <Select
          id={`${idPrefix}-type`}
          value={value.type}
          onValueChange={(v) => onChange(switchRuleType(value, v as RuleType))}
          options={TYPE_OPTIONS}
        />
      </FormField>
      {value.type === 'FIXED' ? (
        <FormField label="Amount a year (₹)" htmlFor={`${idPrefix}-amount`} error={error}>
          <Input
            id={`${idPrefix}-amount`}
            inputMode="decimal"
            value={value.amount}
            onChange={(e) => onChange({ type: 'FIXED', amount: e.target.value })}
            aria-invalid={error ? true : undefined}
          />
        </FormField>
      ) : (
        <FormField label="Percentage" htmlFor={`${idPrefix}-percent`} error={error}>
          <Input
            id={`${idPrefix}-percent`}
            inputMode="decimal"
            value={value.percent}
            onChange={(e) => onChange({ ...value, percent: e.target.value })}
            aria-invalid={error ? true : undefined}
          />
        </FormField>
      )}
      {value.type === 'PERCENT_OF_COMPONENTS' ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-text">Of</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {bases.map((r) => (
              <label key={r.code} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={value.of.includes(r.code)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      of: e.target.checked
                        ? [...value.of, r.code]
                        : value.of.filter((c) => c !== r.code),
                    })
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
