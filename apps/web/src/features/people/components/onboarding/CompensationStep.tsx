import { useEffect } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { useCtcEditor } from '../../hooks/useCtcEditor';
import { usePayBands } from '../../hooks/useMasterData';
import { CtcBreakdownEditor } from '../CtcBreakdownEditor';
import { StepFrame, type StepProps } from './StepFrame';

/** Pay grade, then the CTC and Basic % with the editable breakdown. The CTC is optional: leave it empty to set it later. */
export function CompensationStep({
  form,
  update,
  errors,
  onProblem,
}: StepProps & {
  /** Tells the wizard when the server refuses the numbers as they stand (e.g. the lines add up to more than the CTC). */
  onProblem: (problem: string | null) => void;
}) {
  const payBands = usePayBands();
  const editor = useCtcEditor(form.ctc, form.structure);
  const { previewError } = editor;

  useEffect(() => {
    onProblem(form.ctc.trim() && previewError ? previewError : null);
    return () => onProblem(null);
  }, [form.ctc, previewError, onProblem]);

  return (
    <StepFrame title="Pay grade and CTC">
      <div className="mb-6 max-w-sm">
        <FormField label="Pay grade" htmlFor="c-grade" error={errors['payBandId']}>
          <Select
            id="c-grade"
            value={form.payBandId}
            onValueChange={(v) => update({ payBandId: v })}
            options={[...(payBands.data ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => ({ value: b.id, label: b.name }))}
            placeholder={payBands.isLoading ? 'Loading…' : 'Choose a pay grade'}
            aria-invalid={errors['payBandId'] ? true : undefined}
          />
        </FormField>
      </div>
      <CtcBreakdownEditor
        ctc={form.ctc}
        onCtcChange={(ctc) => update({ ctc })}
        structure={form.structure}
        onStructureChange={(structure) => update({ structure })}
        editor={editor}
        errors={errors}
      />
    </StepFrame>
  );
}
