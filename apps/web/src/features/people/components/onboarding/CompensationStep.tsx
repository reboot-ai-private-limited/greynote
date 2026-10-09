import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatMoney } from '@/lib/format';
import { useCtcPreview } from '../../hooks/useCtc';
import { usePayBands } from '../../hooks/useMasterData';
import { buildPreview, monthlyOf, parseCtc } from '../../lib/ctc';
import { Grid, StepFrame, type StepProps } from './StepFrame';

export function CompensationStep({ form, update, errors }: StepProps) {
  const payBands = usePayBands();
  const ctcPaise = parseCtc(form.ctc);
  const preview = useCtcPreview(buildPreview(form.ctc, {}));
  const lines = preview.data?.lines ?? [];

  return (
    <StepFrame title="Pay grade and CTC">
      <Grid>
        <FormField label="Pay grade" htmlFor="c-grade" error={errors['payBandId']}>
          <Select
            id="c-grade"
            value={form.payBandId}
            onValueChange={(v) => update({ payBandId: v })}
            options={[...(payBands.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ value: b.id, label: b.name }))}
            placeholder={payBands.isLoading ? 'Loading…' : 'Choose a pay grade'}
            aria-invalid={errors['payBandId'] ? true : undefined}
          />
        </FormField>
        <FormField label="CTC per year, ₹ (optional)" htmlFor="c-ctc" error={errors['ctc']}>
          <Input id="c-ctc" inputMode="decimal" value={form.ctc} onChange={(e) => update({ ctc: e.target.value })} aria-invalid={errors['ctc'] ? true : undefined} />
        </FormField>
      </Grid>
      {ctcPaise !== null ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-border" aria-live="polite">
          <p className="bg-surface-subtle px-4 py-2.5 text-sm text-text-muted">
            <span className="font-semibold text-text">{formatMoney(monthlyOf(ctcPaise))}</span> a month
          </p>
          {lines.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {lines.map((l) => (
                <li key={l.code} className="flex justify-between px-4 py-2">
                  <span className="text-text-muted">{l.name}</span>
                  <span className="tabular-nums">{formatMoney(monthlyOf(l.amountPaise))}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </StepFrame>
  );
}
