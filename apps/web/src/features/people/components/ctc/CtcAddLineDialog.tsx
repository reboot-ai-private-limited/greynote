'use client';

import type { PayComponentDto, PayComponentKind } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { draftToRule, type EditorRow, type RuleDraft } from '../../lib/ctcStructure';
import { RuleFields } from './RuleFields';

export interface NewLine {
  name: string;
  kind: PayComponentKind;
  rule: RuleDraft;
}

/** Add a line that exists only for this employee, or put back one of the org's lines that was removed. */
export function CtcAddLineDialog({
  kind,
  rows,
  restorable,
  onAdd,
  onRestore,
  onClose,
}: {
  kind: PayComponentKind;
  rows: readonly EditorRow[];
  /** Org lines removed for this employee that belong to this group. */
  restorable: readonly PayComponentDto[];
  onAdd: (line: NewLine) => void;
  onRestore: (code: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [rule, setRule] = useState<RuleDraft>({
    type: 'PERCENT_OF_COMPONENTS',
    percent: '',
    of: ['BASIC'],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const bases = rows.filter((r) => r.rule !== 'BALANCER');

  function submit() {
    const next: Record<string, string> = {};
    if (name.trim() === '') next['name'] = 'Give the line a name.';
    if (!draftToRule(rule)) {
      next['rule'] =
        rule.type === 'FIXED'
          ? 'Use rupees with at most two decimals.'
          : rule.type === 'PERCENT_OF_COMPONENTS' && rule.of.length === 0
            ? 'Choose at least one line.'
            : 'Use a percentage from 0 to 100, with at most two decimals.';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onAdd({ name, kind, rule });
  }

  return (
    <FormDialog
      title={kind === 'EARNING' ? 'Add an earning' : 'Add an employer contribution'}
      formId="ctc-add-line"
      pending={false}
      onClose={onClose}
      onSubmit={submit}
    >
      {restorable.length > 0 ? (
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-sm font-medium text-text">Put back a removed line</p>
          <div className="flex flex-wrap gap-2">
            {restorable.map((c) => (
              <Button key={c.code} variant="secondary" size="sm" onClick={() => onRestore(c.code)}>
                {c.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <FormField label="Name" htmlFor="add-line-name" error={errors['name']}>
        <Input
          id="add-line-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors['name'] ? true : undefined}
        />
      </FormField>
      <RuleFields
        idPrefix="add-line"
        value={rule}
        onChange={setRule}
        bases={bases}
        error={errors['rule']}
      />
    </FormDialog>
  );
}
