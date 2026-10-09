import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Grid, StepFrame, type StepProps } from './StepFrame';

export function BankStep({ form, update, errors }: StepProps) {
  const invalid = (key: string) => (errors[key] ? true : undefined);
  return (
    <StepFrame title="Bank details">
      <Grid>
        <FormField label="Bank name" htmlFor="b-bank" error={errors['bankName']}>
          <Input id="b-bank" value={form.bankName} onChange={(e) => update({ bankName: e.target.value })} aria-invalid={invalid('bankName')} />
        </FormField>
        <FormField label="Branch name" htmlFor="b-branch" error={errors['branchName']}>
          <Input id="b-branch" value={form.branchName} onChange={(e) => update({ branchName: e.target.value })} aria-invalid={invalid('branchName')} />
        </FormField>
        <FormField label="Account holder name" htmlFor="b-holder" error={errors['accountHolderName']}>
          <Input id="b-holder" value={form.accountHolderName} onChange={(e) => update({ accountHolderName: e.target.value })} aria-invalid={invalid('accountHolderName')} />
        </FormField>
        <FormField label="Account number" htmlFor="b-account" error={errors['accountNumber']}>
          <Input id="b-account" inputMode="numeric" maxLength={20} value={form.accountNumber} onChange={(e) => update({ accountNumber: e.target.value.replace(/\D/g, '') })} aria-invalid={invalid('accountNumber')} />
        </FormField>
        <FormField label="IFSC code" htmlFor="b-ifsc" error={errors['ifsc']}>
          <Input id="b-ifsc" maxLength={11} className="uppercase" value={form.ifsc} onChange={(e) => update({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} aria-invalid={invalid('ifsc')} />
        </FormField>
      </Grid>
    </StepFrame>
  );
}
