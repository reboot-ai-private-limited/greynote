import type { UserDetailDto } from '@greynote/contracts';

export const SETUP_STEPS = ['personal', 'address', 'work', 'bank', 'compensation', 'documents'] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  /** One line on what the step is for. */
  hint: string;
  /** Needed before the employee can be active. */
  required: boolean;
  /** `true`/`false` when the profile says; `null` when it cannot be told from here (the CTC lives on its own screen). */
  done: boolean | null;
}

/** The steps of setting a field employee up, in order, with what the profile already has. */
export function setupSteps(user: UserDetailDto): SetupStep[] {
  const p = user.profile;
  const a = p?.address;
  const b = p?.bankDetails;
  return [
    { key: 'personal', label: 'Personal details', hint: 'Name, mobile number, date of birth, joining date, probation, ESI number.', required: true, done: !!(user.name && p?.mobileNumber && p?.dateOfBirth) },
    { key: 'address', label: 'Address', hint: 'District, state, pincode and country.', required: true, done: !!(a?.district && a.state && a.pincode && a.country) },
    { key: 'work', label: 'Work', hint: 'Designation, pay grade and the manager.', required: true, done: !!(p?.designationId && p.payBandId && p.managerId) },
    { key: 'bank', label: 'Bank details', hint: 'Where salary and expenses are paid.', required: true, done: !!(b?.bankName && b.ifsc && b.accountNumber && b.accountHolderName) },
    { key: 'compensation', label: 'Compensation', hint: 'The CTC and its split. Needs the pay grade first. Can be done later.', required: false, done: null },
    { key: 'documents', label: 'Documents', hint: 'Identity and other papers. Optional.', required: false, done: (p?.documents.length ?? 0) > 0 },
  ];
}

export const isSetupStep = (value: string): value is SetupStepKey => (SETUP_STEPS as readonly string[]).includes(value);

/** Where to start: the step in the address if it is a real one, else the first required step still open, else the first. */
export function startStep(user: UserDetailDto, requested: string | undefined): SetupStepKey {
  if (requested && isSetupStep(requested)) return requested;
  return setupSteps(user).find((s) => s.required && s.done === false)?.key ?? 'personal';
}

/** The step before or after, or `null` at either end. */
export function neighbour(key: SetupStepKey, direction: -1 | 1): SetupStepKey | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(key) + direction] ?? null;
}

/** How many of the required steps are done, for the progress line. */
export function requiredProgress(steps: readonly SetupStep[]): { done: number; total: number } {
  const required = steps.filter((s) => s.required);
  return { done: required.filter((s) => s.done).length, total: required.length };
}
