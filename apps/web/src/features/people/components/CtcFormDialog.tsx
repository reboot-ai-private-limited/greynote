'use client';

import type { CtcAssignmentDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { istMonth } from '@/lib/dates';
import { paiseToRupees } from '@/lib/money';
import { useCtcEditor } from '../hooks/useCtcEditor';
import { useAssignCtc } from '../hooks/useCtc';
import { buildAssignCtc, structureToDraft, type CtcDraft } from '../lib/ctcStructure';
import { CtcBreakdownEditor } from './CtcBreakdownEditor';

/**
 * Set or revise an employee's CTC. Enter the CTC and the Basic %, and the breakdown follows the org's pay components; change
 * any line's percentage or amount for this employee, remove a line, or add one, and "Other allowance" takes the rest so the lines
 * always add up. Saving adds a new revision from the chosen month; earlier ones are kept.
 */
export function CtcFormDialog({
  userId,
  current,
  onClose,
}: {
  userId: string;
  /** The revision in force today, to start from. */
  current?: CtcAssignmentDto | undefined;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CtcDraft>(() => ({
    ctc: current ? paiseToRupees(current.ctcAnnualPaise).replace(/\.00$/, '') : '',
    effectiveFrom: istMonth(),
    reason: '',
    structure: structureToDraft(current?.structure, current?.overrides),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editor = useCtcEditor(draft.ctc, draft.structure);
  const save = useAssignCtc(userId, onClose);
  const set = (patch: Partial<CtcDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function submit() {
    const built = buildAssignCtc(draft, editor.orgCodes);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    save.mutate(built.body);
  }

  return (
    <FormDialog
      title={current ? 'Revise CTC' : 'Set CTC'}
      formId="ctc-form"
      pending={save.isPending}
      disabled={!editor.canSave}
      wide
      onClose={onClose}
      onSubmit={submit}
    >
      <CtcBreakdownEditor
        ctc={draft.ctc}
        onCtcChange={(ctc) => set({ ctc })}
        structure={draft.structure}
        onStructureChange={(structure) => set({ structure })}
        editor={editor}
        errors={errors}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Starts from" htmlFor="ctc-from" error={errors['effectiveFrom']}>
          <Input
            id="ctc-from"
            type="month"
            value={draft.effectiveFrom}
            onChange={(e) => set({ effectiveFrom: e.target.value })}
            aria-invalid={errors['effectiveFrom'] ? true : undefined}
          />
        </FormField>
        <FormField label="Reason (optional)" htmlFor="ctc-reason" error={errors['reason']}>
          <Input
            id="ctc-reason"
            value={draft.reason}
            placeholder="Annual review"
            onChange={(e) => set({ reason: e.target.value })}
          />
        </FormField>
      </div>
    </FormDialog>
  );
}
