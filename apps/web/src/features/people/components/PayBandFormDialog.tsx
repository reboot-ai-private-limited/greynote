'use client';

import type { PayBandDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreatePayBand, useUpdatePayBand } from '../hooks/useMasterData';
import {
  EMPTY_PAY_BAND_RUPEES,
  PAY_BAND_MONEY_FIELDS,
  buildPayBand,
  buildPayBandUpdate,
  payBandToRupees,
  type PayBandRupees,
} from '../lib/masterData';

/**
 * Create (no `band`) or edit (`band`). Mounted only while open, so its draft is fresh each time.
 * `availableNames` are the grades not yet created; an edit cannot rename a grade.
 */
export function PayBandFormDialog({
  band,
  availableNames,
  onClose,
}: {
  band?: PayBandDto | undefined;
  availableNames: readonly string[];
  onClose: () => void;
}) {
  const [name, setName] = useState(band?.name ?? availableNames[0] ?? '');
  const [rupees, setRupees] = useState<PayBandRupees>(band ? payBandToRupees(band) : EMPTY_PAY_BAND_RUPEES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePayBand(onClose);
  const update = useUpdatePayBand(onClose);

  function submit() {
    if (band) {
      const built = buildPayBandUpdate(band, rupees);
      if (!built.ok) return setErrors(built.errors);
      if (Object.keys(built.body).length === 0) return onClose();
      return update.mutate({ id: band.id, body: built.body });
    }
    const built = buildPayBand({ name, rupees });
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={band ? `Edit grade ${band.name}` : 'New pay band'}
      description={
        band
          ? 'Changes apply to future TA/DA and payroll runs. A finalized payroll month is not changed.'
          : 'A grade sets the base salary, TA rate and DA amounts for the employees on it.'
      }
      formId="pay-band-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Grade" htmlFor="pay-band-name" error={errors['name']}>
        {band ? (
          <Input id="pay-band-name" value={band.name} disabled readOnly />
        ) : (
          <Select
            id="pay-band-name"
            value={name}
            onValueChange={setName}
            options={availableNames.map((n) => ({ value: n, label: n }))}
            aria-invalid={errors['name'] ? true : undefined}
          />
        )}
      </FormField>
      {PAY_BAND_MONEY_FIELDS.map(({ key, label }) => (
        <FormField key={key} label={`${label} (₹)`} htmlFor={`pay-band-${key}`} error={errors[key]}>
          <Input
            id={`pay-band-${key}`}
            inputMode="decimal"
            value={rupees[key]}
            onChange={(e) => setRupees({ ...rupees, [key]: e.target.value })}
            aria-invalid={errors[key] ? true : undefined}
          />
        </FormField>
      ))}
    </FormDialog>
  );
}
