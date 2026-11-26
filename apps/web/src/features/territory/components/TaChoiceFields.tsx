'use client';

import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TA_MODE_LABEL, type TaMode } from '../lib/routeDraft';

/** How a route pays TA: each grade's rate per km (the default), the route's own rate per km, or a fixed amount for the day. */
export function TaChoiceFields({
  idPrefix,
  taMode,
  onTaModeChange,
  rate,
  onRateChange,
  fixed,
  onFixedChange,
  errors,
  disabled = false,
}: {
  idPrefix: string;
  taMode: TaMode;
  onTaModeChange: (mode: TaMode) => void;
  rate: string;
  onRateChange: (value: string) => void;
  fixed: string;
  onFixedChange: (value: string) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <>
      <FormField label="TA" htmlFor={`${idPrefix}-ta-mode`} hint="What a day on this route pays as TA.">
        <Select
          id={`${idPrefix}-ta-mode`}
          value={taMode}
          onValueChange={(v) => onTaModeChange(v as TaMode)}
          options={(Object.keys(TA_MODE_LABEL) as TaMode[]).map((m) => ({ value: m, label: TA_MODE_LABEL[m] }))}
          disabled={disabled}
        />
      </FormField>
      {taMode === 'RATE' ? (
        <FormField label="Rate (₹ per km)" htmlFor={`${idPrefix}-rate`} error={errors['rate']} hint="Replaces every grade's own rate on this route.">
          <Input id={`${idPrefix}-rate`} inputMode="decimal" value={rate} onChange={(e) => onRateChange(e.target.value)} disabled={disabled} aria-invalid={errors['rate'] ? true : undefined} />
        </FormField>
      ) : taMode === 'FIXED' ? (
        <FormField label="Fixed TA (₹)" htmlFor={`${idPrefix}-fixed`} error={errors['fixed']} hint="Paid as typed for a day on this route, e.g. a bus fare: never doubled or capped.">
          <Input id={`${idPrefix}-fixed`} inputMode="decimal" value={fixed} onChange={(e) => onFixedChange(e.target.value)} disabled={disabled} aria-invalid={errors['fixed'] ? true : undefined} />
        </FormField>
      ) : (
        <div />
      )}
    </>
  );
}
