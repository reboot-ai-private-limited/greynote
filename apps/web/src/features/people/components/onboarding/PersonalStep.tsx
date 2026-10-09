import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Grid, StepFrame, type StepProps } from './StepFrame';

export function PersonalStep({ form, update, errors }: StepProps) {
  const invalid = (key: string) => (errors[key] ? true : undefined);
  return (
    <StepFrame title="Personal details">
      <Grid>
        <FormField label="Full name" htmlFor="p-name" error={errors['name']}>
          <Input id="p-name" value={form.name} onChange={(e) => update({ name: e.target.value })} aria-invalid={invalid('name')} />
        </FormField>
        <FormField label="Guardian name" htmlFor="p-guardian" error={errors['guardianName']}>
          <Input id="p-guardian" value={form.guardianName} onChange={(e) => update({ guardianName: e.target.value })} aria-invalid={invalid('guardianName')} />
        </FormField>
        <FormField label="Mobile number" htmlFor="p-mobile" error={errors['mobileNumber']}>
          <Input id="p-mobile" inputMode="numeric" maxLength={10} value={form.mobileNumber} onChange={(e) => update({ mobileNumber: e.target.value.replace(/\D/g, '') })} aria-invalid={invalid('mobileNumber')} />
        </FormField>
        <FormField label="Alternate mobile (optional)" htmlFor="p-alt" error={errors['alternateMobile']}>
          <Input id="p-alt" inputMode="numeric" maxLength={10} value={form.alternateMobile} onChange={(e) => update({ alternateMobile: e.target.value.replace(/\D/g, '') })} aria-invalid={invalid('alternateMobile')} />
        </FormField>
        <FormField label="Date of birth" htmlFor="p-dob" error={errors['dateOfBirth']}>
          <Input id="p-dob" type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} aria-invalid={invalid('dateOfBirth')} />
        </FormField>
        <FormField label="Joining date (optional)" htmlFor="p-doj" error={errors['dateOfJoining']}>
          <Input id="p-doj" type="date" value={form.dateOfJoining} onChange={(e) => update({ dateOfJoining: e.target.value })} aria-invalid={invalid('dateOfJoining')} />
        </FormField>
        <FormField label="Probation, months (optional)" htmlFor="p-prob" error={errors['probationMonths']}>
          <Input id="p-prob" inputMode="numeric" value={form.probationMonths} onChange={(e) => update({ probationMonths: e.target.value.replace(/\D/g, '') })} aria-invalid={invalid('probationMonths')} />
        </FormField>
        <FormField label="ESI number (optional)" htmlFor="p-esi" error={errors['esiNumber']}>
          <Input id="p-esi" inputMode="numeric" maxLength={17} value={form.esiNumber} onChange={(e) => update({ esiNumber: e.target.value.replace(/\D/g, '') })} aria-invalid={invalid('esiNumber')} />
        </FormField>
      </Grid>
    </StepFrame>
  );
}
