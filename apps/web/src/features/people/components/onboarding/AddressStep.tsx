import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import type { AddressForm } from '../../lib/onboarding';
import { Block, Grid, StepFrame, type StepProps } from './StepFrame';

function AddressFields({
  id,
  value,
  errors,
  prefix,
  disabled,
  onChange,
}: {
  id: string;
  value: AddressForm;
  errors: Record<string, string>;
  prefix: string;
  disabled?: boolean;
  onChange: (patch: Partial<AddressForm>) => void;
}) {
  const field = (key: keyof AddressForm) => ({
    id: `${id}-${key}`,
    value: value[key],
    disabled,
    onChange: (e: { target: { value: string } }) => onChange({ [key]: e.target.value }),
    'aria-invalid': errors[`${prefix}.${key}`] ? (true as const) : undefined,
  });
  return (
    <Grid>
      <FormField label="Address line 1" htmlFor={`${id}-line1`} error={errors[`${prefix}.line1`]}>
        <Input {...field('line1')} />
      </FormField>
      <FormField label="Address line 2 (optional)" htmlFor={`${id}-line2`}>
        <Input {...field('line2')} />
      </FormField>
      <FormField label="District / city" htmlFor={`${id}-district`} error={errors[`${prefix}.district`]}>
        <Input {...field('district')} />
      </FormField>
      <FormField label="State" htmlFor={`${id}-state`} error={errors[`${prefix}.state`]}>
        <Input {...field('state')} />
      </FormField>
      <FormField label="Pincode" htmlFor={`${id}-pincode`} error={errors[`${prefix}.pincode`]}>
        <Input {...field('pincode')} inputMode="numeric" maxLength={6} onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, '') })} />
      </FormField>
    </Grid>
  );
}

export function AddressStep({ form, update, errors }: StepProps) {
  const same = form.permanentSameAsPresent;
  return (
    <StepFrame title="Address">
      <Block title="Present address">
        <AddressFields id="present" prefix="present" value={form.present} errors={errors} onChange={(patch) => update({ present: { ...form.present, ...patch } })} />
      </Block>
      <Block title="Permanent address">
        <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent)]"
            checked={same}
            // Ticking copies what is typed so far; the fields then follow the present address until untick.
            onChange={(e) => update({ permanentSameAsPresent: e.target.checked, ...(e.target.checked ? { permanent: form.present } : {}) })}
          />
          Same as present address
        </label>
        <AddressFields
          id="permanent"
          prefix="permanent"
          value={same ? form.present : form.permanent}
          errors={errors}
          disabled={same}
          onChange={(patch) => update({ permanent: { ...form.permanent, ...patch } })}
        />
      </Block>
    </StepFrame>
  );
}
