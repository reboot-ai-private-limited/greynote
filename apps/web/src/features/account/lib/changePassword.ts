import { passwordError } from '@/features/people/lib/user';

export interface ChangePasswordDraft {
  current: string;
  next: string;
  again: string;
}

export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordDraft, string>>;

/** The same rules as the API, plus the retype. Passwords are sent exactly as typed: trimming would change what must be typed to sign in. */
export function changePasswordErrors(draft: ChangePasswordDraft): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};
  if (draft.current === '') errors.current = 'Enter your current password.';
  if (draft.next === '') errors.next = 'Enter a new password.';
  else {
    const problem = passwordError(draft.next);
    if (problem) errors.next = problem;
    else if (draft.next === draft.current) errors.next = 'Use a password different from the current one.';
  }
  if (!errors.next && draft.again !== draft.next) errors.again = 'The two passwords do not match.';
  return errors;
}
