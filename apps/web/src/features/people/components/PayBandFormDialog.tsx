'use client';

import type { PayBandDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useCreatePayBand, useUpdatePayBand } from '../hooks/useMasterData';
import {
  EMPTY_PAY_BAND_RUPEES,
  PAY_BAND_MONEY_FIELDS,
  PAY_BAND_NAME_MAX,
  buildPayBand,
  buildPayBandUpdate,
  payBandToRupees,
  type PayBandRupees,
} from '../lib/masterData';

/** Create (no `band`) or edit (`band`). Mounted only while open, so its draft is fresh each time. `all` are the existing grades, for the duplicate-name check. */
export function PayBandFormDialog({
  band,
  all,
  onClose,
}: {
  band?: PayBandDto | undefined;
  all: readonly PayBandDto[];
  onClose: () => void;
}) {
  const [name, setName] = useState(band?.name ?? '');
  const [rupees, setRupees] = useState<PayBandRupees>(band ? payBandToRupees(band) : EMPTY_PAY_BAND_RUPEES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePayBand(onClose);
  const update = useUpdatePayBand(onClose);

  function submit() {
    if (band) {
      const built = buildPayBandUpdate(band, { name, rupees }, all);
      if (!built.ok) return setErrors(built.errors);
      if (Object.keys(built.body).length === 0) return onClose();
      return update.mutate({ id: band.id, body: built.body });
    }
    const built = buildPayBand({ name, rupees }, all);
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={band ? `Edit grade ${band.name}` : 'New pay grade'}
      description={
        band
          ? 'Changes apply to future TA/DA, CTC assignments and payroll runs. Saved CTCs and finalized payroll are not changed.'
          : 'A grade sets the CTC range an employee on it can be paid, plus the TA rate and DA amounts.'
      }
      formId="pay-band-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="pay-band-name" error={errors['name']}>
        <Input id="pay-band-name" value={name} maxLength={PAY_BAND_NAME_MAX + 5} placeholder="G1" onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
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
