import type { WizardForm } from '../../lib/onboarding';

export { Block, Grid, StepFrame } from '@/components/ui/WizardParts';

/** What every step receives: the form, a setter for it, and the errors to show (empty until Next is pressed). */
export interface StepProps {
  form: WizardForm;
  update: (patch: Partial<WizardForm>) => void;
  errors: Record<string, string>;
}
